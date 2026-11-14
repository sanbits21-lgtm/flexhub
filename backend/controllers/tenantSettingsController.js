const Tenant = require('../models/Tenant');
const Branch = require('../models/Branch');
const { logAudit } = require('../utils/audit');
const { gymMemberAppUrl } = require('../utils/links');
const { resolveFeatures } = require('../utils/features');
const { MAX_FIELDS, cleanLabel, cleanType, uniqueKey } = require('../utils/memberFields');
const { changeSlug, cleanBrandColor, cleanGradientAngle, brandColors, cleanLogoUrl, publicBrand, baseDomain, REDIRECT_DAYS } = require('../utils/subdomain');
const { MAX_PHOTO_BYTES, sniffImage, imageSize, storePhoto, removePhotoFile, sendPhoto } = require('../utils/photos');

const LOGO_FOLDER = 'tenant-logos';
// A logo can be small (it is shown at menu size), but not so small it turns to mush.
const MIN_LOGO_PIXELS = 64;

// Read-only for branch-manager too (they need it to show the UPI QR when collecting a
// member's payment); only tenant-admin may change it — deliberately scoped to just these
// two fields, never the full Tenant document (billing/maxBranches stay platform-controlled).
exports.getMine = async (req, res) => {
  const tenant = await Tenant.findById(req.scope.tenantId).select('name upiId upiPaymentLink');
  if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
  // `upiId` / `upiPaymentLink` stay the gym's default account. A branch that banks separately appears
  // in `branchAccounts` (only branches the caller can see: a branch manager gets their own, if any).
  const branches = await Branch.find({ tenantId: req.scope.tenantId, ...(req.scope.branchId ? { _id: req.scope.branchId } : {}) }).select('upiId upiPaymentLink').lean();
  const branchAccounts = {};
  branches.forEach((b) => { if (b.upiId) branchAccounts[String(b._id)] = { upiId: b.upiId, upiPaymentLink: b.upiPaymentLink || '' }; });
  res.json({ ...tenant.toObject(), branchAccounts });
};

// Owner only: the gym's default account and every branch's own, for the Payment Settings page.
exports.getPaymentAccounts = async (req, res) => {
  const [tenant, branches] = await Promise.all([
    Tenant.findById(req.scope.tenantId).select('name upiId upiPaymentLink').lean(),
    Branch.find({ tenantId: req.scope.tenantId, isActive: true }).select('name upiId upiPaymentLink').sort({ name: 1 }).lean(),
  ]);
  if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
  res.json({
    gymName: tenant.name,
    default: { upiId: tenant.upiId || '', upiPaymentLink: tenant.upiPaymentLink || '' },
    branches: branches.map((b) => ({ _id: b._id, name: b.name, upiId: b.upiId || '', upiPaymentLink: b.upiPaymentLink || '', usesDefault: !b.upiId })),
  });
};

// Owner only. Blank both fields to put the branch back on the gym's default account.
exports.updateBranchAccount = async (req, res) => {
  const upiId = req.body.upiId || '';
  const upiPaymentLink = req.body.upiPaymentLink || '';
  // A link without an ID would not be this branch's account: it would borrow the gym's.
  if (upiPaymentLink && !upiId) return res.status(400).json({ message: 'Add the branch\'s UPI ID as well as the link, or clear the link.' });
  const branch = await Branch.findOneAndUpdate(
    { _id: req.params.branchId, tenantId: req.scope.tenantId },
    { upiId, upiPaymentLink },
    { new: true },
  ).select('name upiId upiPaymentLink');
  if (!branch) return res.status(404).json({ message: 'Branch not found' });
  logAudit(req, 'UPDATE_BRANCH_PAYMENT_SETTINGS', { type: 'Branch', id: branch._id });
  res.json({ _id: branch._id, name: branch.name, upiId: branch.upiId || '', upiPaymentLink: branch.upiPaymentLink || '', usesDefault: !branch.upiId });
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
  brand: {
    ...brandColors(tenant),
    logoUrl: tenant.brand?.logoUrl || '',
    hasLogoFile: !!tenant.brand?.logoFile,
    displayName: tenant.brand?.displayName || '',
    tagline: tenant.brand?.tagline || '',
  },
  // What the rest of the site (menu, login page) will show after this save.
  public: publicBrand(tenant),
  canChangeAddress: !!resolveFeatures(tenant)['features:customSubdomain'],
  redirectDays: REDIRECT_DAYS,
  previousAddresses: (tenant.previousSlugs || []).filter((p) => p.until > new Date()),
});

exports.getBranding = async (req, res) => {
  const tenant = await Tenant.findById(req.scope.tenantId).select('name slug brand previousSlugs features');
  if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
  res.json(brandingView(tenant));
};

// The gym's logo as an uploaded picture. The type comes from the bytes, never from what the browser claims.
exports.uploadLogo = async (req, res) => {
  const raw = typeof req.body?.image === 'string' ? req.body.image.replace(/^data:[^;]+;base64,/, '') : '';
  if (!raw || !/^[A-Za-z0-9+/=\s]+$/.test(raw)) return res.status(400).json({ message: 'Send the logo as base64 in "image".' });
  const buf = Buffer.from(raw, 'base64');
  if (buf.length > MAX_PHOTO_BYTES) return res.status(413).json({ message: 'Logo is too large. Maximum is 1 MB.' });
  const type = sniffImage(buf);
  if (!type) return res.status(400).json({ message: 'Logo must be a PNG, JPEG or WebP image.' });
  const size = imageSize(buf, type);
  if (!size || !size.width || !size.height) return res.status(400).json({ message: 'Could not read the size of that picture. Try a different one.' });
  if (Math.min(size.width, size.height) < MIN_LOGO_PIXELS) return res.status(400).json({ message: `Logo is too small (${size.width}x${size.height}). Use at least ${MIN_LOGO_PIXELS}x${MIN_LOGO_PIXELS} pixels.` });
  const tenant = await Tenant.findById(req.scope.tenantId);
  if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
  const previous = tenant.brand.logoFile;
  tenant.brand.logoFile = await storePhoto(LOGO_FOLDER, tenant._id, buf, type);
  await tenant.save();
  await removePhotoFile(LOGO_FOLDER, previous);
  logAudit(req, 'UPDATE_TENANT_LOGO', { type: 'Tenant', id: tenant._id });
  res.json(brandingView(tenant));
};

exports.removeLogo = async (req, res) => {
  const tenant = await Tenant.findById(req.scope.tenantId);
  if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
  const previous = tenant.brand.logoFile;
  tenant.brand.logoFile = '';
  await tenant.save();
  await removePhotoFile(LOGO_FOLDER, previous);
  logAudit(req, 'REMOVE_TENANT_LOGO', { type: 'Tenant', id: tenant._id });
  res.json(brandingView(tenant));
};

// Public (the login page shows it before anyone signs in): a gym's logo by its address name.
exports.publicLogo = async (req, res) => {
  const tenant = await Tenant.findOne({ slug: String(req.params.slug || '').toLowerCase(), isActive: true }).select('brand.logoFile');
  if (!tenant?.brand?.logoFile) return res.status(404).json({ message: 'No logo' });
  return sendPhoto(res, LOGO_FOLDER, tenant.brand.logoFile);
};

exports.updateBranding = async (req, res) => {
  const tenant = await Tenant.findById(req.scope.tenantId);
  if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
  const { color, color2, gradientAngle, logoUrl, displayName, tagline, slug } = req.body || {};

  if (color !== undefined) tenant.brand.color = cleanBrandColor(color);
  if (color2 !== undefined) tenant.brand.color2 = cleanBrandColor(color2);
  if (gradientAngle !== undefined) tenant.brand.gradientAngle = cleanGradientAngle(gradientAngle);
  if (logoUrl !== undefined) tenant.brand.logoUrl = cleanLogoUrl(logoUrl);
  if (displayName !== undefined) {
    if (typeof displayName !== 'string' || displayName.trim().length > 40) return res.status(400).json({ message: 'The name must be 40 characters or fewer.' });
    tenant.brand.displayName = displayName.trim();
  }
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
