const User = require('../models/User');
const Tenant = require('../models/Tenant');
const generateToken = require('../utils/generateToken');
const { startSession, deliver, revokeActor } = require('../utils/sessions');
const throttle = require('../utils/loginThrottle');
const { passwordProblem } = require('../utils/passwordPolicy');
const { resolveFeatures } = require('../utils/features');
const { publicBrand } = require('../utils/subdomain');
const { subscriptionOf, approvalBlock } = require('../utils/subscription');

// super-admin/platform-admin have no tenantId and are never feature-gated (see
// backend/middleware/features.js) — features is omitted for them rather than resolved
// against nothing, and frontend/src/hooks/useFeature.js treats "absent" as always-on.
const featuresForUser = async (user) => {
  if (!user.tenantId) return undefined;
  const tenant = await Tenant.findById(user.tenantId).select('features');
  return resolveFeatures(tenant);
};

// The gym's own look, so the website can theme itself even when reached on the main address.
const subscriptionForUser = async (user) => {
  if (!user.tenantId) return undefined;
  const tenant = await Tenant.findById(user.tenantId).select('billingPlan trialEndsAt planEndsAt packageName maxMembers maxBranches');
  return tenant ? subscriptionOf(tenant) : undefined;
};

const brandForUser = async (user) => {
  if (!user.tenantId) return undefined;
  const tenant = await Tenant.findById(user.tenantId).select('name slug brand');
  return tenant ? publicBrand(tenant) : undefined;
};

// Staff login (super-admin, platform-admin, tenant-admin, branch-manager, trainer).
// There is no public staff registration endpoint — accounts are always created by a
// higher role in the hierarchy (see platformAdminController/tenantController/branchController).
exports.login = async (req, res) => {
  const { email, password } = req.body;
  // An address under our domain that belongs to no gym is not a place to sign in.
  if (req.unknownHost) return res.status(401).json({ message: 'Invalid credentials' });
  // Per-account lock: too many wrong passwords for this email, whether or not it exists.
  const throttleKey = throttle.keyFor('user', email);
  const lock = await throttle.check(throttleKey);
  if (lock.locked) return throttle.lockedResponse(res, lock);
  const user = await User.findOne({ email: email?.toLowerCase() });
  // Always spend the time of a password check, so an unknown email is not faster than a known one.
  const passwordOk = user && user.isActive ? await user.matchPassword(password) : (await throttle.burn(password), false);
  if (!passwordOk) {
    await throttle.fail(throttleKey);
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  await throttle.clear(throttleKey);
  // On a gym's own address only that gym's people may sign in. Same message as a wrong
  // password, so the address cannot be used to discover who works where. Platform staff
  // (no tenant) may sign in anywhere.
  if (req.hostTenant && user.tenantId && String(user.tenantId) !== String(req.hostTenant._id)) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  if (user.tenantId) {
    if (user.emailVerified === false) {
      return res.status(403).json({ code: 'EMAIL_NOT_VERIFIED', message: 'Please confirm your email first. Check your inbox for the confirmation link.' });
    }
    const tenant = await Tenant.findById(user.tenantId).select('approvalStatus');
    const blocked = tenant && approvalBlock(tenant);
    if (blocked) return res.status(blocked.status).json({ code: blocked.code, message: blocked.message });
  }
  user.lastLoginAt = new Date();
  await user.save();

  const issued = await startSession('user', user, req);
  res.json({
    ...deliver(req, res, 'user', issued),
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      branchId: user.branchId,
      hasPhoto: !!user.photoUrl,
    },
    features: await featuresForUser(user),
    brand: await brandForUser(user),
    subscription: await subscriptionForUser(user),
  });
};

exports.getMe = async (req, res) => {
  const { photoUrl, ...user } = req.user.toObject();
  res.json({ user: { ...user, hasPhoto: !!photoUrl }, features: await featuresForUser(req.user), brand: await brandForUser(req.user), subscription: await subscriptionForUser(req.user) });
};

exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 72) {
    return res.status(400).json({ message: 'New password must be 8 to 72 characters.' });
  }
  const user = await User.findById(req.user._id);
  if (!(await user.matchPassword(currentPassword))) {
    return res.status(400).json({ message: 'Current password is incorrect' });
  }
  const weak = passwordProblem(newPassword, user);
  if (weak) return res.status(400).json({ message: weak });
  user.password = newPassword;
  // Sessions started before this moment stop working (a stolen token must not outlive a password
  // change); the caller gets a fresh one so they stay signed in.
  user.passwordResetAt = new Date();
  await user.save();
  await revokeActor('user', user._id, req.sid); // every other device's refresh token dies too
  res.json({ message: 'Password updated', token: generateToken(user._id, 'user', req.sid) });
};
