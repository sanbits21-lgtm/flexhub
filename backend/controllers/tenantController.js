const Tenant = require('../models/Tenant');
const User = require('../models/User');
const { logAudit } = require('../utils/audit');
const { FEATURE_REGISTRY } = require('../config/featureRegistry');
const { resolveFeatures } = require('../utils/features');

// Unlike every other collection (which has its own `tenantId` field pointing back to a
// Tenant), a Tenant document's own identity IS the tenant id — its key is `_id`, not
// `tenantId`. Spreading req.scope directly into a Tenant query (as every other controller
// correctly does for its own collection) silently matches nothing whenever scope.tenantId
// is set, since no Tenant document has that field. This translates scope -> `_id` instead.
const scopeToTenantFilter = (scope) => {
  if (scope.tenantId === undefined) return {};
  if (scope.tenantId && typeof scope.tenantId === 'object' && scope.tenantId.$in) {
    return { _id: { $in: scope.tenantId.$in } };
  }
  return { _id: scope.tenantId };
};

// For single-document lookups by :id, combine with $and rather than object-spreading two
// `_id` keys into one literal (the second would silently clobber the first).
const tenantByIdFilter = (req) => {
  const scopeFilter = scopeToTenantFilter(req.scope);
  if (Object.keys(scopeFilter).length === 0) return { _id: req.params.id };
  return { $and: [{ _id: req.params.id }, scopeFilter] };
};

exports.list = async (req, res) => {
  const tenants = await Tenant.find(scopeToTenantFilter(req.scope)).sort({ createdAt: -1 });
  res.json(tenants);
};

exports.getOne = async (req, res) => {
  const tenant = await Tenant.findOne(tenantByIdFilter(req));
  if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
  res.json(tenant);
};

// Onboards a tenant AND its first Tenant Admin in one call.
exports.create = async (req, res) => {
  const { name, slug, contactEmail, contactPhone, billingPlan, maxBranches, admin } = req.body;

  const tenant = await Tenant.create({
    name, slug, contactEmail, contactPhone, billingPlan, maxBranches,
    createdBy: req.user._id,
  });

  const tenantAdmin = await User.create({
    name: admin.name,
    email: admin.email,
    phone: admin.phone,
    password: admin.password,
    role: 'tenant-admin',
    tenantId: tenant._id,
  });

  // Only for a platform-admin ALREADY scoped to specific tenants (managedTenantIds
  // non-empty) — they'd otherwise immediately lose visibility into a tenant they just
  // created, since scopeContext filters strictly to that list. Critically, this must
  // NOT run for an unscoped platform-admin (empty managedTenantIds = sees every
  // tenant): adding their first entry here would flip scopeContext from "unscoped" to
  // "scoped to just this one," silently hiding every other tenant they could see a
  // moment ago. This was a real bug — creating a tenant made every older tenant vanish
  // from the list for any platform-admin who hadn't been deliberately scoped down yet.
  if (req.user.role === 'platform-admin' && req.user.managedTenantIds?.length) {
    await User.updateOne({ _id: req.user._id }, { $addToSet: { managedTenantIds: tenant._id } });
  }

  logAudit(req, 'CREATE_TENANT', { type: 'Tenant', id: tenant._id, metadata: { tenantAdminId: tenantAdmin._id } });
  res.status(201).json({ tenant, tenantAdmin: { ...tenantAdmin.toObject(), password: undefined } });
};

exports.update = async (req, res) => {
  const { name, contactEmail, contactPhone, billingPlan, billingStatus, maxBranches, isActive } = req.body;
  const tenant = await Tenant.findOneAndUpdate(
    tenantByIdFilter(req),
    { name, contactEmail, contactPhone, billingPlan, billingStatus, maxBranches, isActive },
    { new: true }
  );
  if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
  logAudit(req, 'UPDATE_TENANT', { type: 'Tenant', id: tenant._id });
  res.json(tenant);
};

exports.suspend = async (req, res) => {
  const tenant = await Tenant.findOneAndUpdate(
    tenantByIdFilter(req),
    { billingStatus: 'suspended', isActive: false },
    { new: true }
  );
  if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
  logAudit(req, 'SUSPEND_TENANT', { type: 'Tenant', id: tenant._id });
  res.json(tenant);
};

// Workspace — the per-tenant feature-flag UI (frontend/src/pages/platform/Workspace.jsx).
// Both endpoints ride on this router's existing requireRole('super-admin',
// 'platform-admin'), so nothing extra is needed to keep this platform-admin-only.
exports.getFeatures = async (req, res) => {
  const tenant = await Tenant.findOne(tenantByIdFilter(req)).select('name features');
  if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
  res.json({
    tenantId: tenant._id,
    tenantName: tenant.name,
    registry: FEATURE_REGISTRY,
    // resolved = what's actually in effect; overrides = only the keys this tenant
    // deviates from the registry default on (what the checkboxes actually persist).
    resolved: resolveFeatures(tenant),
    overrides: Object.fromEntries(tenant.features || []),
  });
};

exports.updateFeatures = async (req, res) => {
  const updates = req.body.features || {};
  const unknown = Object.keys(updates).filter((key) => !FEATURE_REGISTRY[key]);
  if (unknown.length) {
    return res.status(400).json({ message: `Unknown feature key(s): ${unknown.join(', ')}` });
  }

  // Full document, not .select('features') — tenant.save() below runs full schema
  // validation, which would fail on required fields (name/slug/contactEmail) that a
  // partial-select doc never loaded in the first place.
  const tenant = await Tenant.findOne(tenantByIdFilter(req));
  if (!tenant) return res.status(404).json({ message: 'Tenant not found' });

  const before = resolveFeatures(tenant);
  for (const [key, value] of Object.entries(updates)) {
    tenant.features.set(key, !!value);
  }
  await tenant.save();
  const after = resolveFeatures(tenant);

  // Only the keys that actually changed value — a support ticket needs "what changed,"
  // not "the whole registry was resent."
  const changed = Object.fromEntries(
    Object.keys(updates)
      .filter((key) => before[key] !== after[key])
      .map((key) => [key, { from: before[key], to: after[key] }])
  );
  logAudit(req, 'UPDATE_TENANT_FEATURES', { type: 'Tenant', id: tenant._id, metadata: { changed } });

  res.json({ resolved: after, overrides: Object.fromEntries(tenant.features) });
};

// Creates an additional Tenant Admin for an existing tenant.
exports.createTenantAdmin = async (req, res) => {
  const tenant = await Tenant.findOne(tenantByIdFilter(req));
  if (!tenant) return res.status(404).json({ message: 'Tenant not found' });

  const { name, email, phone, password } = req.body;
  const tenantAdmin = await User.create({
    name, email, phone, password, role: 'tenant-admin', tenantId: tenant._id,
  });
  logAudit(req, 'CREATE_TENANT_ADMIN', { type: 'User', id: tenantAdmin._id, metadata: { tenantId: tenant._id } });
  res.status(201).json({ ...tenantAdmin.toObject(), password: undefined });
};
