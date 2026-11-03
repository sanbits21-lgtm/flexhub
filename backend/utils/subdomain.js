const Tenant = require('../models/Tenant');
const { BadRequest } = require('./query');

// Names that would be confusing or dangerous as a gym's address: infrastructure hosts,
// look-alikes people could be phished with, and our own routes.
const RESERVED = new Set([
  'www', 'api', 'app', 'admin', 'administrator', 'root', 'mail', 'email', 'smtp', 'imap', 'ftp', 'ns1', 'ns2',
  'cdn', 'static', 'assets', 'dashboard', 'login', 'signin', 'signup', 'register', 'support', 'help', 'status',
  'billing', 'payments', 'secure', 'account', 'accounts', 'flexhub', 'platform', 'staging', 'dev', 'test', 'demo',
  'health', 'privacy', 'terms', 'blog', 'docs',
]);

const REDIRECT_DAYS = 90;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/; // 3-30 chars, no leading/trailing hyphen

/** Normalises and validates a subdomain label; throws BadRequest with a showable message. */
const cleanSlug = (value) => {
  const slug = String(value ?? '').trim().toLowerCase();
  if (!SLUG_RE.test(slug)) throw new BadRequest('Address must be 3-30 characters: lowercase letters, numbers and hyphens, not starting or ending with a hyphen.');
  if (slug.includes('--')) throw new BadRequest('Address cannot contain two hyphens in a row.');
  if (RESERVED.has(slug)) throw new BadRequest('That address is reserved. Please choose another.');
  return slug;
};

/** True if nobody uses the slug now, nor holds it as a redirect that is still running. */
const isSlugFree = async (slug, exceptTenantId) => {
  const now = new Date();
  const clash = await Tenant.exists({
    ...(exceptTenantId ? { _id: { $ne: exceptTenantId } } : {}),
    $or: [{ slug }, { previousSlugs: { $elemMatch: { slug, until: { $gt: now } } } }],
  });
  return !clash;
};

/**
 * Renames a tenant's address (mutates the document; caller saves). The old address keeps
 * redirecting for REDIRECT_DAYS so bookmarks, installed web apps and links in messages do not
 * die, and nobody else can claim it in that window (they could intercept the old links).
 * Returns true when something changed.
 */
const changeSlug = async (tenant, requested) => {
  const slug = cleanSlug(requested);
  if (slug === tenant.slug) return false;
  if (!(await isSlugFree(slug, tenant._id))) throw new BadRequest('That address is already taken.');
  const now = Date.now();
  tenant.previousSlugs = (tenant.previousSlugs || [])
    .filter((p) => p.until.getTime() > now && p.slug !== slug)
    .concat({ slug: tenant.slug, until: new Date(now + REDIRECT_DAYS * 86400000) });
  tenant.slug = slug;
  return true;
};

const baseDomain = () => (process.env.BASE_DOMAIN || '').trim().toLowerCase().replace(/^\./, '');

/** "ironhub.example.com" -> "ironhub" when BASE_DOMAIN=example.com; otherwise null. */
const labelFromHost = (hostname) => {
  const base = baseDomain();
  const host = String(hostname || '').toLowerCase();
  if (!base || !host.endsWith(`.${base}`)) return null;
  const label = host.slice(0, -(base.length + 1));
  return label && !label.includes('.') ? label : null;
};

// ---- brand colour ------------------------------------------------------------------------
const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const luminance = (hex) => {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** The accent is a button/nav background on the near-black theme, so it must stand out from it. */
const cleanBrandColor = (value) => {
  if (value === '' || value === null || value === undefined) return '';
  const hex = String(value).trim().toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(hex)) throw new BadRequest('Colour must look like #C8F83A.');
  if (contrast(hex, '#0A0C10') < 3) throw new BadRequest('That colour is too dark to read on the dark theme. Pick a brighter one.');
  return hex;
};

const cleanLogoUrl = (value) => {
  if (value === '' || value === null || value === undefined) return '';
  const url = String(value).trim();
  if (url.length > 500 || !/^https:\/\/[^\s"'<>]+$/i.test(url)) throw new BadRequest('Logo must be an https:// link to an image.');
  return url;
};

const publicBrand = (tenant) => ({
  name: tenant.name,
  slug: tenant.slug,
  color: tenant.brand?.color || '',
  logoUrl: tenant.brand?.logoUrl || '',
  tagline: tenant.brand?.tagline || '',
});

module.exports = { cleanSlug, changeSlug, isSlugFree, labelFromHost, baseDomain, cleanBrandColor, cleanLogoUrl, publicBrand, REDIRECT_DAYS, RESERVED };
