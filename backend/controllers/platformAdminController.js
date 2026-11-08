const User = require('../models/User');
const Tenant = require('../models/Tenant');
const { logAudit } = require('../utils/audit');

exports.list = async (req, res) => {
  const admins = await User.find({ role: 'platform-admin' }).select('-password');
  res.json(admins);
};

exports.create = async (req, res) => {
  const { name, email, phone, password } = req.body;
  const weak = require('../utils/passwordPolicy').passwordProblem(password, { name, email, phone });
  if (weak) return res.status(400).json({ message: weak });
  const admin = await User.create({ name, email, phone, password, role: 'platform-admin' });
  logAudit(req, 'CREATE_PLATFORM_ADMIN', { type: 'User', id: admin._id });
  res.status(201).json({ ...admin.toObject(), password: undefined });
};

exports.update = async (req, res) => {
  const { name, phone, isActive, managedTenantIds } = req.body;

  // Empty/omitted managedTenantIds means "unscoped — sees every tenant" (see
  // scopeContext), so only validate when the caller is actually assigning specific ones.
  if (Array.isArray(managedTenantIds) && managedTenantIds.length > 0) {
    const validCount = await Tenant.countDocuments({ _id: { $in: managedTenantIds } });
    if (validCount !== managedTenantIds.length) {
      return res.status(400).json({ message: 'One or more selected tenants do not exist' });
    }
  }

  const admin = await User.findOneAndUpdate(
    { _id: req.params.id, role: 'platform-admin' },
    { name, phone, isActive, managedTenantIds },
    { new: true }
  ).select('-password');
  if (!admin) return res.status(404).json({ message: 'Platform admin not found' });
  logAudit(req, 'UPDATE_PLATFORM_ADMIN', { type: 'User', id: admin._id });
  res.json(admin);
};

exports.remove = async (req, res) => {
  const admin = await User.findOneAndUpdate(
    { _id: req.params.id, role: 'platform-admin' },
    { isActive: false },
    { new: true }
  );
  if (!admin) return res.status(404).json({ message: 'Platform admin not found' });
  logAudit(req, 'DEACTIVATE_PLATFORM_ADMIN', { type: 'User', id: admin._id });
  res.json({ message: 'Platform admin deactivated' });
};
