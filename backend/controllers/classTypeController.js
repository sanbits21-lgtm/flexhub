const ClassType = require('../models/ClassType');
const Branch = require('../models/Branch');
const { logAudit } = require('../utils/audit');
const { sendList } = require('../utils/paginate');

// Tenant-wide templates (branchId: null) are visible everywhere; branch-scoped
// templates only at their own branch. Same rule as membershipPlanController.
// req.scope carries a branchId for branch-manager always, and for trainer/tenant-admin
// only when scoped to one branch — ClassType has no trainerId field, so the virtual
// scope key needs no translation here (unlike Booking/ClassSession-for-trainer).
const visibleFilter = (req) => {
  const filter = { tenantId: req.scope.tenantId };
  if (req.scope.branchId) filter.$or = [{ branchId: null }, { branchId: req.scope.branchId }];
  return filter;
};

exports.list = async (req, res) => {
  await sendList(res, req, ClassType, visibleFilter(req));
};

exports.create = async (req, res) => {
  const { name, description, durationMinutes, defaultCapacity, branchId } = req.body;
  if (branchId) {
    const branch = await Branch.findOne({ _id: branchId, tenantId: req.scope.tenantId });
    if (!branch) return res.status(400).json({ message: 'Branch not found for this tenant' });
  }
  const classType = await ClassType.create({
    tenantId: req.scope.tenantId, branchId: branchId || null, name, description, durationMinutes, defaultCapacity,
  });
  logAudit(req, 'CREATE_CLASS_TYPE', { type: 'ClassType', id: classType._id });
  res.status(201).json(classType);
};

exports.update = async (req, res) => {
  const { name, description, durationMinutes, defaultCapacity, isActive, branchId } = req.body;
  if (branchId) {
    const branch = await Branch.findOne({ _id: branchId, tenantId: req.scope.tenantId });
    if (!branch) return res.status(400).json({ message: 'Branch not found for this tenant' });
  }
  const classType = await ClassType.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.scope.tenantId },
    { name, description, durationMinutes, defaultCapacity, isActive, branchId: branchId || null },
    { new: true }
  );
  if (!classType) return res.status(404).json({ message: 'Class type not found' });
  logAudit(req, 'UPDATE_CLASS_TYPE', { type: 'ClassType', id: classType._id });
  res.json(classType);
};

exports.remove = async (req, res) => {
  const classType = await ClassType.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.scope.tenantId },
    { isActive: false },
    { new: true }
  );
  if (!classType) return res.status(404).json({ message: 'Class type not found' });
  logAudit(req, 'DEACTIVATE_CLASS_TYPE', { type: 'ClassType', id: classType._id });
  res.json({ message: 'Class type deactivated' });
};
