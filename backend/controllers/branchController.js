const Branch = require('../models/Branch');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const { logAudit } = require('../utils/audit');

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
  const { name, address, phone, timezone, capacity } = req.body;

  const tenant = await Tenant.findById(req.scope.tenantId);
  const branchCount = await Branch.countDocuments({ tenantId: req.scope.tenantId, isActive: true });
  if (branchCount >= tenant.maxBranches) {
    return res.status(403).json({ message: `Branch limit (${tenant.maxBranches}) reached for this plan` });
  }

  const branch = await Branch.create({
    tenantId: req.scope.tenantId, name, address, phone, timezone, capacity, createdBy: req.user._id,
  });
  logAudit(req, 'CREATE_BRANCH', { type: 'Branch', id: branch._id });
  res.status(201).json(branch);
};

exports.update = async (req, res) => {
  const { name, address, phone, timezone, capacity, isActive } = req.body;
  const branch = await Branch.findOneAndUpdate(
    { _id: req.params.id, ...req.scope },
    { name, address, phone, timezone, capacity, isActive },
    { new: true }
  );
  if (!branch) return res.status(404).json({ message: 'Branch not found' });
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
