const Tenant = require('../models/Tenant');
const { resolveFeatures } = require('../utils/features');

// Loads req.features for tenant-scoped actors only (tenant-admin, branch-manager,
// trainer, member) — never for super-admin/platform-admin, who must always see
// everything regardless of what a tenant has disabled, since they need full visibility
// for support. Deliberately a separate middleware rather than folded into scopeContext
// (backend/middleware/auth.js) — that function is load-bearing and already covered by
// the existing test suite; a sibling middleware is lower-risk than editing it.
const attachFeatures = async (req, res, next) => {
  const tenantId = req.actorType === 'member' ? req.member?.tenantId : req.user?.tenantId;
  if (!tenantId) return next();
  const tenant = await Tenant.findById(tenantId).select('features');
  req.features = resolveFeatures(tenant);
  next();
};

// Same closure-factory style as requireRole/allowActors in auth.js. Only blocks when a
// resolved flag is explicitly false — an actor with no req.features (super-admin,
// platform-admin) is never gated, since attachFeatures skips them entirely.
const requireFeature = (key) => (req, res, next) => {
  if (req.features && req.features[key] === false) {
    return res.status(403).json({ message: 'This feature is not enabled for your gym. Contact support to enable it.' });
  }
  next();
};

module.exports = { attachFeatures, requireFeature };
