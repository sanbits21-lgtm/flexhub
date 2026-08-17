const AuditLog = require('../models/AuditLog');

// req.scope.tenantId is usually a single ObjectId, but for a platform-admin scoped to
// several tenants (managedTenantIds non-empty) it's a query shape ({$in: [...]}) —
// passing that straight through failed AuditLog's schema cast silently (caught below,
// never thrown), so every such platform-admin's actions went completely unlogged.
// When the action's own target IS a tenant (create/update/suspend a tenant, etc.),
// that's the precise single tenant to record; otherwise there's no single tenant to
// attribute it to, so it's left unset rather than passing the query object through.
const resolveTenantId = (req, target) => {
  const scopeTenantId = req.scope?.tenantId;
  if (scopeTenantId && typeof scopeTenantId === 'object' && scopeTenantId.$in) {
    return target.type === 'Tenant' ? target.id : null;
  }
  return scopeTenantId || null;
};

// Fire-and-forget audit trail; never blocks or fails the request it's called from.
const logAudit = (req, action, target = {}) => {
  const actor = req.actorType === 'user' ? req.user : req.member;
  const actorRole = req.actorType === 'user' ? req.user?.role : 'member';
  AuditLog.create({
    tenantId: resolveTenantId(req, target),
    actorId: actor?._id,
    actorRole,
    actorName: actor?.name,
    actorEmail: actor?.email,
    action,
    targetType: target.type,
    targetId: target.id,
    metadata: target.metadata,
    ip: req.ip,
  }).catch((err) => console.error('Audit log write failed:', err.message));
};

module.exports = { logAudit };
