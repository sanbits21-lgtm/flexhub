const MembershipPlan = require('../models/MembershipPlan');
const { usableAtFilter, readPlanBranches } = require('../utils/planBranches');
const { logAudit } = require('../utils/audit');
const { sendList } = require('../utils/paginate');

const tenantOnlyFilter = (req) => ({ tenantId: req.scope.tenantId });

// A plan with no branches listed is visible everywhere; otherwise only at the branches it names. A
// branch-manager's scope always carries their branchId; a tenant-admin only gets one when drilling into a
// branch via ?branchId=.
exports.list = async (req, res) => {
  const filter = tenantOnlyFilter(req);
  if (req.scope.branchId) Object.assign(filter, usableAtFilter(req.scope.branchId));
  await sendList(res, req, MembershipPlan, filter);
};

exports.create = async (req, res) => {
  const { name, durationUnit, price, description, features } = req.body;
  const branches = await readPlanBranches(req.body, req.scope.tenantId);
  if (branches.error) return res.status(400).json({ message: branches.error });
  const plan = await MembershipPlan.create({
    tenantId: req.scope.tenantId, branchIds: branches.ids || [], name, durationUnit, price, description, features,
  });
  logAudit(req, 'CREATE_MEMBERSHIP_PLAN', { type: 'MembershipPlan', id: plan._id });
  res.status(201).json(plan);
};

exports.update = async (req, res) => {
  const { name, durationUnit, price, description, features, isActive } = req.body;
  const branches = await readPlanBranches(req.body, req.scope.tenantId);
  if (branches.error) return res.status(400).json({ message: branches.error });
  const changes = { name, durationUnit, price, description, features, isActive };
  if (branches.ids !== undefined) changes.branchIds = branches.ids; // left alone when the request does not mention branches
  const plan = await MembershipPlan.findOneAndUpdate({ _id: req.params.id, ...tenantOnlyFilter(req) }, changes, { new: true });
  if (!plan) return res.status(404).json({ message: 'Membership plan not found' });
  logAudit(req, 'UPDATE_MEMBERSHIP_PLAN', { type: 'MembershipPlan', id: plan._id });
  res.json(plan);
};

exports.remove = async (req, res) => {
  const plan = await MembershipPlan.findOneAndUpdate(
    { _id: req.params.id, ...tenantOnlyFilter(req) },
    { isActive: false },
    { new: true }
  );
  if (!plan) return res.status(404).json({ message: 'Membership plan not found' });
  logAudit(req, 'DEACTIVATE_MEMBERSHIP_PLAN', { type: 'MembershipPlan', id: plan._id });
  res.json({ message: 'Membership plan deactivated' });
};
