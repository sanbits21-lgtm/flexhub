const Tenant = require('../models/Tenant');
const SubscriptionPackage = require('../models/SubscriptionPackage');
const User = require('../models/User');
const { logAudit } = require('../utils/audit');
const { FEATURE_REGISTRY } = require('../config/featureRegistry');
const { resolveFeatures } = require('../utils/features');
const { cleanSlug, changeSlug, isSlugFree } = require('../utils/subdomain');
const { getSettings, whole } = require('../utils/platformSettings');
const { templated } = require('../utils/mailer');
const { gymLoginUrl } = require('../utils/links');

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
  const tenants = await Tenant.find(scopeToTenantFilter(req.scope)).sort({ createdAt: -1 })
    .populate('requestedPackageId', 'name price billingCycle trialDays maxBranches maxMembers');
  // For gyms awaiting approval, say whether the owner has confirmed their email yet.
  const pendingIds = tenants.filter((t) => t.approvalStatus === 'pending').map((t) => t._id);
  const owners = pendingIds.length
    ? await User.find({ tenantId: { $in: pendingIds }, role: 'tenant-admin' }).select('tenantId name email emailVerified').lean()
    : [];
  const ownerOf = new Map(owners.map((o) => [String(o.tenantId), o]));
  res.json(tenants.map((t) => {
    const o = ownerOf.get(String(t._id));
    return { ...t.toObject(), owner: o ? { name: o.name, email: o.email, emailVerified: o.emailVerified !== false } : undefined };
  }));
};

exports.getOne = async (req, res) => {
  const tenant = await Tenant.findOne(tenantByIdFilter(req));
  if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
  res.json(tenant);
};

// Onboards a tenant AND its first Tenant Admin in one call.
exports.create = async (req, res) => {
  const { name, contactEmail, contactPhone, billingPlan, maxBranches, admin } = req.body;
  const slug = cleanSlug(req.body.slug);
  if (!(await isSlugFree(slug))) return res.status(409).json({ message: 'That address is already taken.' });

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
  const { name, contactEmail, contactPhone, billingPlan, billingStatus, maxBranches, isActive, slug, trialEndsAt, maxMembers } = req.body;
  const changes = { name, contactEmail, contactPhone, billingPlan, billingStatus, maxBranches, isActive };
  // Moving to a paid plan ends the trial and lifts its member cap, unless told otherwise.
  if (billingPlan && billingPlan !== 'trial') {
    changes.trialEndsAt = null;
    if (maxMembers === undefined) changes.maxMembers = null;
  }
  if (trialEndsAt !== undefined) changes.trialEndsAt = trialEndsAt ? new Date(trialEndsAt) : null;
  if (maxMembers !== undefined) changes.maxMembers = maxMembers ? Number(maxMembers) : null;
  const tenant = await Tenant.findOneAndUpdate(tenantByIdFilter(req), changes, { new: true });
  if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
  // Platform staff may rename a gym's address at any time (the old one redirects for 90 days).
  if (slug !== undefined && await changeSlug(tenant, slug)) {
    await tenant.save();
    logAudit(req, 'CHANGE_TENANT_SLUG', { type: 'Tenant', id: tenant._id, metadata: { to: tenant.slug } });
  }
  logAudit(req, 'UPDATE_TENANT', { type: 'Tenant', id: tenant._id });
  res.json(tenant);
};

// Lets a self-registered gym in. The trial clock starts now (not at signup), with the
// platform's current terms unless the approver overrides them for this one gym.
exports.approve = async (req, res) => {
  const tenant = await Tenant.findOne(tenantByIdFilter(req));
  if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
  if (tenant.approvalStatus === 'approved') return res.status(409).json({ message: 'This gym is already approved.' });
  const owner = await User.findOne({ tenantId: tenant._id, role: 'tenant-admin' }).sort({ createdAt: 1 });
  if (owner && owner.emailVerified === false) {
    return res.status(400).json({ message: 'The owner has not confirmed their email address yet.' });
  }
  const s = await getSettings();
  const body = req.body || {};
  // The package the gym asked for, unless the approver picks another. Its terms are the
  // defaults; anything the approver types for this one gym wins over them.
  const wantedId = body.packageId || tenant.requestedPackageId;
  const pkg = wantedId ? await SubscriptionPackage.findById(wantedId) : null;
  if (body.packageId && !pkg) return res.status(400).json({ message: 'That package does not exist.' });
  const terms = pkg
    ? { days: pkg.trialDays, maxMembers: pkg.maxMembers ?? null, maxBranches: pkg.maxBranches }
    : { days: s.trialDays, maxMembers: s.trialMaxMembers, maxBranches: s.trialMaxBranches };
  // 0 trial days (packages only) means live from approval; null members means unlimited.
  const days = whole(body.trialDays ?? terms.days, 'Trial length', pkg ? 0 : 1, 365);
  const members = body.maxMembers === undefined ? terms.maxMembers : body.maxMembers === null ? null : whole(body.maxMembers, 'Member limit', 1, 100000);
  tenant.maxMembers = members ?? undefined;
  tenant.maxBranches = whole(body.maxBranches ?? terms.maxBranches, 'Branch limit', 1, 100);
  tenant.approvalStatus = 'approved';
  tenant.approvedAt = new Date();
  tenant.approvedBy = req.user._id;
  tenant.rejectionReason = undefined;
  tenant.packageId = pkg ? pkg._id : undefined;
  tenant.packageName = pkg ? pkg.name : undefined;
  // Billing itself happens outside the app: a package with no trial is simply live from now.
  tenant.billingPlan = days > 0 ? 'trial' : 'basic';
  tenant.trialEndsAt = days > 0 ? new Date(Date.now() + days * 86400000) : undefined;
  await tenant.save();
  if (owner) {
    const limit = tenant.maxMembers ? `up to ${tenant.maxMembers} members` : 'unlimited members';
    const what = days > 0 ? `Your ${days}-day free trial` : `Your ${pkg?.name || 'plan'} package`;
    templated({
      to: owner.email,
      subject: `${tenant.name} is approved on FlexHub`,
      heading: 'You are in!',
      body: `${tenant.name} has been approved. ${what} starts now (${limit}). Sign in with the email and password you registered with.`,
      buttonText: 'Sign in',
      buttonUrl: gymLoginUrl(tenant, req),
    });
  }
  logAudit(req, 'APPROVE_TENANT', { type: 'Tenant', id: tenant._id, metadata: { trialDays: days, maxMembers: tenant.maxMembers, maxBranches: tenant.maxBranches, package: pkg?.name } });
  res.json(tenant);
};

exports.reject = async (req, res) => {
  const tenant = await Tenant.findOne(tenantByIdFilter(req));
  if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
  if (tenant.approvalStatus === 'approved') return res.status(409).json({ message: 'This gym is already approved. Suspend it instead.' });
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 200) : '';
  tenant.approvalStatus = 'rejected';
  tenant.rejectionReason = reason || undefined;
  await tenant.save();
  const owner = await User.findOne({ tenantId: tenant._id, role: 'tenant-admin' }).sort({ createdAt: 1 });
  if (owner) {
    templated({
      to: owner.email,
      subject: `Your FlexHub registration for ${tenant.name}`,
      heading: 'We could not approve your registration',
      body: `${reason ? `Reason: ${reason}. ` : ''}If you think this is a mistake, please reply to this email or contact support.`,
    });
  }
  logAudit(req, 'REJECT_TENANT', { type: 'Tenant', id: tenant._id, metadata: { reason } });
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
