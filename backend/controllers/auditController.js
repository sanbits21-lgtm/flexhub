const AuditLog = require('../models/AuditLog');
const q = require('../utils/query');
const { pageParams } = require('../utils/paginate');

// super-admin sees everything (or one tenant via ?tenantId=, per scopeContext);
// platform-admin sees only their managed tenants' logs, same as every other resource.
exports.list = async (req, res) => {
  const { page, limit } = pageParams(req, { defaultLimit: 50 });
  const action = q.str(req.query.action, 'action', 60);
  const actorRole = q.str(req.query.actorRole, 'actorRole', 30);
  const dateFrom = q.date(req.query.dateFrom, 'dateFrom');
  const dateTo = q.date(req.query.dateTo, 'dateTo');
  const filter = { ...req.scope };
  if (action) filter.action = action;
  if (actorRole) filter.actorRole = actorRole;
  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = dateFrom;
    if (dateTo) filter.createdAt.$lte = dateTo;
  }

  const [logs, total, actions] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    AuditLog.countDocuments(filter),
    AuditLog.distinct('action', req.scope),
  ]);
  res.json({ logs, total, page: Number(page), actions: actions.sort() });
};
