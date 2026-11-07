const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Member = require('../models/Member');
const Tenant = require('../models/Tenant');
const { approvalBlock, expiryBlock } = require('../utils/subscription');

// A token issued before the account's password was reset by someone else is dead. JWT `iat`
// is whole seconds, so compare at second resolution (a token minted in the same second as
// the reset survives, which is harmless: the reset was just handed to its owner).
const isRevoked = (decoded, actor) =>
  !!actor.passwordResetAt && decoded.iat < Math.floor(actor.passwordResetAt.getTime() / 1000);

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// A suspended or cancelled gym is locked out entirely. A gym whose free trial has ended can
// still sign in and READ everything (so the owner can see and export their data, and know
// what to pay for), but cannot change anything until the platform activates a plan. Members
// are never penalised for their gym's billing: only suspension reaches them.
const gymStateBlock = async (req) => {
  const tenantId = req.actorType === 'member' ? req.member.tenantId : req.user.tenantId;
  if (!tenantId) return null; // platform staff
  const tenant = await Tenant.findById(tenantId).select('isActive billingStatus billingPlan trialEndsAt planEndsAt approvalStatus');
  if (!tenant) return null;
  const unapproved = approvalBlock(tenant);
  if (unapproved) return unapproved;
  if (!tenant.isActive || ['suspended', 'cancelled'].includes(tenant.billingStatus)) {
    return { status: 403, code: 'GYM_SUSPENDED', message: 'This gym account is suspended. Please contact support.' };
  }
  const expired = expiryBlock(tenant);
  if (expired && req.actorType === 'user' && !SAFE_METHODS.has(req.method) && !req.originalUrl.startsWith('/api/auth/')) return expired;
  return null;
};

// Verifies the JWT and loads the actor (staff User or Member) it belongs to.
const protect = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Not authorized' });
  }
  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.actorType === 'member') {
      req.member = await Member.findById(decoded.id).select('-password -customFields');
      if (!req.member || !req.member.isActive || isRevoked(decoded, req.member)) {
        return res.status(401).json({ message: 'Invalid session' });
      }
      req.actorType = 'member';
    } else {
      req.user = await User.findById(decoded.id).select('-password');
      if (!req.user || !req.user.isActive || isRevoked(decoded, req.user)) {
        return res.status(401).json({ message: 'Invalid session' });
      }
      req.actorType = 'user';
    }
    const blocked = await gymStateBlock(req);
    if (blocked) return res.status(blocked.status).json({ message: blocked.message, code: blocked.code });
    next();
  } catch {
    res.status(401).json({ message: 'Token invalid' });
  }
};

// Restricts a route to a fixed set of staff roles.
const requireRole = (...roles) => (req, res, next) => {
  if (req.actorType !== 'user' || !roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  next();
};

// Like requireRole, but for routes a member actor is also legitimately allowed to hit
// (self check-in, own attendance history). requireRole alone can't express this: it
// rejects every member token by design, which is why these routes previously had no
// gate at all and were reachable by any authenticated actor.
const allowActors = ({ member = false, roles = [] }) => (req, res, next) => {
  if (req.actorType === 'member') {
    if (member) return next();
    return res.status(403).json({ message: 'Forbidden' });
  }
  if (!roles.includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
  next();
};

// Computes req.scope, the Mongo filter base every controller must use for reads.
// Generalizes the 2-role storeScope pattern to the 6-actor hierarchy.
const scopeContext = (req, res, next) => {
  if (req.actorType === 'member') {
    req.scope = {
      memberId: req.member._id,
      tenantId: req.member.tenantId,
      branchId: req.member.branchId,
    };
    return next();
  }

  const { role, tenantId, branchId, managedTenantIds } = req.user;

  switch (role) {
    case 'super-admin':
      req.scope = req.query.tenantId ? { tenantId: req.query.tenantId } : {};
      break;
    case 'platform-admin':
      if (managedTenantIds && managedTenantIds.length) {
        req.scope = { tenantId: { $in: managedTenantIds } };
      } else {
        req.scope = req.query.tenantId ? { tenantId: req.query.tenantId } : {};
      }
      break;
    case 'tenant-admin':
      if (!tenantId) return res.status(403).json({ message: 'No tenant assigned to your account' });
      req.scope = req.query.branchId ? { tenantId, branchId: req.query.branchId } : { tenantId };
      break;
    case 'branch-manager':
      if (!tenantId || !branchId) return res.status(403).json({ message: 'No branch assigned to your account' });
      req.scope = { tenantId, branchId };
      break;
    case 'trainer':
      if (!tenantId || !branchId) return res.status(403).json({ message: 'No branch assigned to your account' });
      req.scope = { tenantId, branchId, trainerId: req.user._id };
      break;
    default:
      return res.status(403).json({ message: 'Unknown role' });
  }
  next();
};

// On writes, overwrite any client-supplied tenantId/branchId with the caller's own scope
// so a buggy or malicious frontend can never smuggle a foreign tenant/branch into a document.
const enforceWriteScope = (req, res, next) => {
  if (req.actorType === 'user' && ['tenant-admin', 'branch-manager', 'trainer'].includes(req.user.role)) {
    req.body.tenantId = req.scope.tenantId;
    if (req.scope.branchId) req.body.branchId = req.scope.branchId;
  }
  next();
};

module.exports = { protect, requireRole, allowActors, scopeContext, enforceWriteScope };
