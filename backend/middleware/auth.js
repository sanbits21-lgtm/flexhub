const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Member = require('../models/Member');

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
      req.member = await Member.findById(decoded.id).select('-password');
      if (!req.member || !req.member.isActive) {
        return res.status(401).json({ message: 'Invalid session' });
      }
      req.actorType = 'member';
    } else {
      req.user = await User.findById(decoded.id).select('-password');
      if (!req.user || !req.user.isActive) {
        return res.status(401).json({ message: 'Invalid session' });
      }
      req.actorType = 'user';
    }
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
