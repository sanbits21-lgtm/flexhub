const Branch = require('../models/Branch');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const MembershipPlan = require('../models/MembershipPlan');
const mongoose = require('mongoose');
const { planAllowedAt } = require('../utils/planBranches');
const { logAudit } = require('../utils/audit');

// Which membership plans a branch offers, set from the branch form. `planIds` is the full list of plans the branch
// should offer. A plan offered everywhere that is switched off here becomes "every other branch"; a plan limited to
// some branches gains or loses this one. A plan can never end up with no branch at all (an empty list means every
// branch), so that case is refused with a pointer to switching the plan off instead. Returns { ops } or { error }.
const planChangesFor = async (tenantId, branchId, planIds) => {
  const wanted = new Set(planIds.map(String));
  if ([...wanted].some((id) => !mongoose.isValidObjectId(id))) return { error: 'Plan not found for this tenant' };
  const plans = await MembershipPlan.find({ tenantId, isActive: true });
  const known = new Set(plans.map((p) => String(p._id)));
  if ([...wanted].some((id) => !known.has(id))) return { error: 'Plan not found for this tenant' };
  const others = (await Branch.find({ tenantId }).select('_id')).map((b) => String(b._id)).filter((id) => id !== String(branchId));
  const ops = [];
  for (const plan of plans) {
    const applies = planAllowedAt(plan, branchId);
    const wants = wanted.has(String(plan._id));
    if (wants === applies) continue;
    const current = (plan.branchIds || []).map(String);
    let next;
    if (wants) next = [...current, String(branchId)];
    else if (!current.length) next = others;
    else next = current.filter((id) => id !== String(branchId));
    if (!next.length) return { error: `"${plan.name}" would then be offered at no branch. Turn the plan off in Membership Plans instead.` };
    ops.push({ id: plan._id, branchIds: next });
  }
  return { ops };
};
const applyPlanChanges = (tenantId, ops) => Promise.all(ops.map((op) => MembershipPlan.updateOne({ _id: op.id, tenantId }, { branchIds: op.branchIds })));

exports.list = async (req, res) => {
  const branches = await Branch.find(req.scope).sort({ createdAt: -1 });
  res.json(branches);
};

exports.getOne = async (req, res) => {
  const branch = await Branch.findOne({ _id: req.params.id, ...req.scope });
  if (!branch) return res.status(404).json({ message: 'Branch not found' });
  res.json(branch);
};

exports.create = async (req, res) => {
  const { name, address, phone, timezone, capacity, planIds } = req.body;
  if (planIds !== undefined && !Array.isArray(planIds)) return res.status(400).json({ message: 'planIds must be a list of plan ids' });

  const tenant = await Tenant.findById(req.scope.tenantId);
  const branchCount = await Branch.countDocuments({ tenantId: req.scope.tenantId, isActive: true });
  if (branchCount >= tenant.maxBranches) {
    return res.status(403).json({ message: `Branch limit (${tenant.maxBranches}) reached for this plan` });
  }

  const _id = new mongoose.Types.ObjectId();
  let plan = { ops: [] };
  if (planIds !== undefined) {
    plan = await planChangesFor(req.scope.tenantId, _id, planIds);
    if (plan.error) return res.status(400).json({ message: plan.error });
  }
  const branch = await Branch.create({
    _id, tenantId: req.scope.tenantId, name, address, phone, timezone, capacity, createdBy: req.user._id,
  });
  await applyPlanChanges(req.scope.tenantId, plan.ops);
  logAudit(req, 'CREATE_BRANCH', { type: 'Branch', id: branch._id });
  res.status(201).json(branch);
};

exports.update = async (req, res) => {
  const { name, address, phone, timezone, capacity, isActive, planIds } = req.body;
  if (planIds !== undefined && !Array.isArray(planIds)) return res.status(400).json({ message: 'planIds must be a list of plan ids' });
  const badPhone = await require('../utils/phoneNumber').phoneEditProblem(Branch, { _id: req.params.id, ...req.scope }, phone);
  if (badPhone) return res.status(400).json({ message: badPhone });
  let plan = { ops: [] };
  if (planIds !== undefined) {
    const exists = await Branch.exists({ _id: req.params.id, ...req.scope });
    if (!exists) return res.status(404).json({ message: 'Branch not found' });
    plan = await planChangesFor(req.scope.tenantId, req.params.id, planIds);
    if (plan.error) return res.status(400).json({ message: plan.error });
  }
  const branch = await Branch.findOneAndUpdate(
    { _id: req.params.id, ...req.scope },
    { name, address, phone, timezone, capacity, isActive },
    { new: true }
  );
  if (!branch) return res.status(404).json({ message: 'Branch not found' });
  await applyPlanChanges(req.scope.tenantId, plan.ops);
  logAudit(req, 'UPDATE_BRANCH', { type: 'Branch', id: branch._id });
  res.json(branch);
};

exports.remove = async (req, res) => {
  const branch = await Branch.findOneAndUpdate(
    { _id: req.params.id, ...req.scope },
    { isActive: false },
    { new: true }
  );
  if (!branch) return res.status(404).json({ message: 'Branch not found' });
  logAudit(req, 'DEACTIVATE_BRANCH', { type: 'Branch', id: branch._id });
  res.json({ message: 'Branch deactivated' });
};

// Creates a Branch Manager scoped to this branch.
exports.createManager = async (req, res) => {
  const branch = await Branch.findOne({ _id: req.params.id, ...req.scope });
  if (!branch) return res.status(404).json({ message: 'Branch not found' });

  const { name, email, phone, password } = req.body;
  const manager = await User.create({
    name, email, phone, password, role: 'branch-manager', tenantId: branch.tenantId, branchId: branch._id,
  });
  logAudit(req, 'CREATE_BRANCH_MANAGER', { type: 'User', id: manager._id, metadata: { branchId: branch._id } });
  res.status(201).json({ ...manager.toObject(), password: undefined });
};
