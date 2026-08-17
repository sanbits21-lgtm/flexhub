const User = require('../models/User');
const Tenant = require('../models/Tenant');
const generateToken = require('../utils/generateToken');
const { resolveFeatures } = require('../utils/features');

// super-admin/platform-admin have no tenantId and are never feature-gated (see
// backend/middleware/features.js) — features is omitted for them rather than resolved
// against nothing, and frontend/src/hooks/useFeature.js treats "absent" as always-on.
const featuresForUser = async (user) => {
  if (!user.tenantId) return undefined;
  const tenant = await Tenant.findById(user.tenantId).select('features');
  return resolveFeatures(tenant);
};

// Staff login (super-admin, platform-admin, tenant-admin, branch-manager, trainer).
// There is no public staff registration endpoint — accounts are always created by a
// higher role in the hierarchy (see platformAdminController/tenantController/branchController).
exports.login = async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: email?.toLowerCase() });
  if (!user || !user.isActive || !(await user.matchPassword(password))) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  user.lastLoginAt = new Date();
  await user.save();

  res.json({
    token: generateToken(user._id, 'user'),
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      branchId: user.branchId,
    },
    features: await featuresForUser(user),
  });
};

exports.getMe = async (req, res) => {
  res.json({ user: req.user, features: await featuresForUser(req.user) });
};

exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id);
  if (!(await user.matchPassword(currentPassword))) {
    return res.status(400).json({ message: 'Current password is incorrect' });
  }
  user.password = newPassword;
  await user.save();
  res.json({ message: 'Password updated' });
};
