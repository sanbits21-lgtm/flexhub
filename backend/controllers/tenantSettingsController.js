const Tenant = require('../models/Tenant');
const { logAudit } = require('../utils/audit');
const { gymMemberAppUrl } = require('../utils/links');
const { resolveFeatures } = require('../utils/features');
const { MAX_FIELDS, cleanLabel, cleanType, uniqueKey } = require('../utils/memberFields');
const { changeSlug, cleanBrandColor, cleanGradientAngle, brandColors, cleanLogoUrl, baseDomain, REDIRECT_DAYS } = require('../utils/subdomain');

// Read-only for branch-manager too (they need it to show the UPI QR when collecting a
// member's payment); only tenant-admin may change it — deliberately scoped to just these
// two fields, never the full Tenant document (billing/maxBranches stay platform-controlled).
exports.getMine = async (req, res) => {
  const tenant = await Tenant.findById(req.scope.tenantId).select('name upiId upiPaymentLink');
  if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
  res.json(tenant);
};

// The address a member opens to use the member app, for the QR code at the front desk or on the
// manager's screen. It is the gym's own address when subdomains are on, else the main site.
exports.getMemberAppLink = async (req, res) => {
  const tenant = await Tenant.findById(req.scope.tenantId).select('name slug');
  if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
  res.json({ url: gymMemberAppUrl(tenant, req), gymName: tenant.name });
};

exports.updateMine = async (req, res) => {
  const { upiId, upiPaymentLink } = req.body;
  const tenant = await Tenant.findByIdAndUpdate(
    req.scope.tenantId,
    { upiId: upiId || '', upiPaymentLink: upiPaymentLink || '' },
    { new: true }
  ).select('name upiId upiPaymentLink');
  if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
  logAudit(req, 'UPDATE_TENANT_PAYMENT_SETTINGS', { type: 'Tenant', id: tenant._id });
  res.json(tenant);
};

// ---------- the gym's own member fields ----------

exports.getMemberFields = async (req, res) => {
  const tenant = await Tenant.findById(req.scope.tenantId).select('memberFields').lean();
  if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
  res.json({ fields: tenant.memberFields || [], max: MAX_FIELDS });
};

// Create-only on purpose: removing or retyping a field would orphan the values already saved
// on members. The label can still be shown differently later without changing the key.
exports.createMemberField = async (req, res) => {
  const label = cleanLabel(req.body?.label);
  const type = cleanType(req.body?.type);
  const tenant = await Tenant.findById(req.scope.tenantId).select('memberFields');
  if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
  const defs = tenant.memberFields || [];
  if (defs.some((d) => d.label.toLowerCase() === label.toLowerCase())) {
    return res.status(409).json({ message: `You already have a field called "${label}".` });
  }
  const field = { key: uniqueKey(label, defs), label, type };
  // The cap is part of the update filter, so two requests at once cannot both slip past it.
  const updated = await Tenant.findOneAndUpdate(
    { _id: tenant._id, [`memberFields.${MAX_FIELDS - 1}`]: { $exists: false } },
    { $push: { memberFields: field } },
    { new: true },
  ).select('_id');
  if (!updated) return res.status(400).json({ message: `You can have at most ${MAX_FIELDS} custom fields.` });
  logAudit(req, 'CREATE_MEMBER_FIELD', { type: 'Tenant', id: tenant._id, metadata: { key: field.key } });
  res.status(201).json(field);
};

// ---------- branding and address (tenant-admin) ----------

const brandingView = (tenant) => ({
  name: tenant.name,
  slug: tenant.slug,
  baseDomain: baseDomain(),
  brand: { ...brandColors(tenant), logoUrl: tenant.brand?.logoUrl || '', tagline: tenant.brand?.tagline || '' },
  canChangeAddress: !!resolveFeatures(tenant)['features:customSubdomain'],
  redirectDays: REDIRECT_DAYS,
  previousAddresses: (tenant.previousSlugs || []).filter((p) => p.until > new Date()),
});

exports.getBranding = async (req, res) => {
  const tenant = await Tenant.findById(req.scope.tenantId).select('name slug brand previousSlugs features');
  if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
  res.json(brandingView(tenant));
};

exports.updateBranding = async (req, res) => {
  const tenant = await Tenant.findById(req.scope.tenantId);
  if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
  const { color, color2, gradientAngle, logoUrl, tagline, slug } = req.body || {};

  if (color !== undefined) tenant.brand.color = cleanBrandColor(color);
  if (color2 !== undefined) tenant.brand.color2 = cleanBrandColor(color2);
  if (gradientAngle !== undefined) tenant.brand.gradientAngle = cleanGradientAngle(gradientAngle);
  if (logoUrl !== undefined) tenant.brand.logoUrl = cleanLogoUrl(logoUrl);
  if (tagline !== undefined) {
    if (typeof tagline !== 'string' || tagline.length > 80) return res.status(400).json({ message: 'Tagline must be 80 characters or fewer.' });
    tenant.brand.tagline = tagline.trim();
  }
  let renamed = false;
  if (slug !== undefined && slug !== tenant.slug) {
    if (!resolveFeatures(tenant)['features:customSubdomain']) return res.status(403).json({ message: 'Changing your address is not enabled for your gym. Ask your platform administrator.' });
    renamed = await changeSlug(tenant, slug);
  }
  await tenant.save();
  logAudit(req, 'UPDATE_TENANT_BRANDING', { type: 'Tenant', id: tenant._id, metadata: renamed ? { slug: tenant.slug } : {} });
  res.json(brandingView(tenant));
};
