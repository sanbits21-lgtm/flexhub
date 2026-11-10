const { baseDomain } = require('./subdomain');

// Where links in emails point. PUBLIC_URL (https://app.example.com) is authoritative in
// production; otherwise fall back to the address the request came in on.
const publicOrigin = (req) => (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

/** A page on the gym's own address: its subdomain when subdomains are on, else the main site. */
const gymUrl = (tenant, req, path) => {
  const base = baseDomain();
  if (!base) return `${publicOrigin(req)}${path}`;
  const proto = (process.env.PUBLIC_URL || '').startsWith('http://') ? 'http' : req.protocol;
  const port = (req.get('host') || '').match(/:\d+$/)?.[0] || '';
  return `${proto}://${tenant.slug}.${base}${port}${path}`;
};

/** Where a gym's people sign in. */
const gymLoginUrl = (tenant, req) => gymUrl(tenant, req, '/login');

/** The member app: what the front-desk QR code opens on a member's phone. */
const gymMemberAppUrl = (tenant, req) => gymUrl(tenant, req, '/member');

module.exports = { publicOrigin, gymLoginUrl, gymMemberAppUrl };
