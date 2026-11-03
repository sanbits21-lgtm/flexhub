const Tenant = require('../models/Tenant');
const { logAudit } = require('../utils/audit');
const { resolveFeatures } = require('../utils/features');
const { changeSlug, cleanBrandColor, cleanLogoUrl, baseDomain, REDIRECT_DAYS } = require('../utils/subdomain');

// Read-only for branch-manager too (they need it to show the UPI QR when collecting a
// member's payment); only tenant-admin may change it — deliberately scoped to just these
// two fields, never the full Tenant document (billing/maxBranches stay platform-controlled).
exports.getMine = async (req, res) => {
  const tenant = await Tenant.findById(req.scope.tenantId).select('name upiId upiPaymentLink');
  if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
  res.json(tenant);
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

// ---------- branding and address (tenant-admin) ----------

const brandingView = (tenant) => ({
  name: tenant.name,
  slug: tenant.slug,
  baseDomain: baseDomain(),
  brand: { color: tenant.brand?.color || '', logoUrl: tenant.brand?.logoUrl || '', tagline: tenant.brand?.tagline || '' },
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
  const { color, logoUrl, tagline, slug } = req.body || {};

  if (color !== undefined) tenant.brand.color = cleanBrandColor(color);
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
