const MembershipPlan = require('../models/MembershipPlan');
const Branch = require('../models/Branch');
const { logAudit } = require('../utils/audit');
const { sendList } = require('../utils/paginate');

const tenantOnlyFilter = (req) => ({ tenantId: req.scope.tenantId });

// Tenant-wide plans (branchId: null) are visible everywhere; branch-scoped plans only
// at their own branch. A branch-manager's scope always carries their branchId; a
// tenant-admin only gets one when drilling into a branch via ?branchId=.
exports.list = async (req, res) => {
  const filter = tenantOnlyFilter(req);
  if (req.scope.branchId) filter.$or = [{ branchId: null }, { branchId: req.scope.branchId }];
  await sendList(res, req, MembershipPlan, filter);
};

exports.create = async (req, res) => {
  const { name, durationUnit, price, description, features, branchId } = req.body;
  if (branchId) {
    const branch = await Branch.findOne({ _id: branchId, tenantId: req.scope.tenantId });
    if (!branch) return res.status(400).json({ message: 'Branch not found for this tenant' });
  }
  const plan = await MembershipPlan.create({
    tenantId: req.scope.tenantId, branchId: branchId || null, name, durationUnit, price, description, features,
  });
  logAudit(req, 'CREATE_MEMBERSHIP_PLAN', { type: 'MembershipPlan', id: plan._id });
  res.status(201).json(plan);
};

exports.update = async (req, res) => {
  const { name, durationUnit, price, description, features, isActive, branchId } = req.body;
  if (branchId) {
    const branch = await Branch.findOne({ _id: branchId, tenantId: req.scope.tenantId });
    if (!branch) return res.status(400).json({ message: 'Branch not found for this tenant' });
  }
  const plan = await MembershipPlan.findOneAndUpdate(
    { _id: req.params.id, ...tenantOnlyFilter(req) },
    { name, durationUnit, price, description, features, isActive, branchId: branchId || null },
    { new: true }
  );
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
