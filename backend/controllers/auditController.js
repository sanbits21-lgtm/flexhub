const AuditLog = require('../models/AuditLog');

// super-admin sees everything (or one tenant via ?tenantId=, per scopeContext);
// platform-admin sees only their managed tenants' logs, same as every other resource.
exports.list = async (req, res) => {
  const { action, actorRole, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
  const filter = { ...req.scope };
  if (action) filter.action = action;
  if (actorRole) filter.actorRole = actorRole;
  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
    if (dateTo) filter.createdAt.$lte = new Date(dateTo);
  }

  const [logs, total, actions] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(Number(limit)),
    AuditLog.countDocuments(filter),
    AuditLog.distinct('action', req.scope),
  ]);
  res.json({ logs, total, page: Number(page), actions: actions.sort() });
};
