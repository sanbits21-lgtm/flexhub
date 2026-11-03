const { baseDomain } = require('./subdomain');

// Where links in emails point. PUBLIC_URL (https://app.example.com) is authoritative in
// production; otherwise fall back to the address the request came in on.
const publicOrigin = (req) => (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

/** Where a gym's people sign in: its own subdomain when subdomains are on, else the main site. */
const gymLoginUrl = (tenant, req) => {
  const base = baseDomain();
  if (!base) return `${publicOrigin(req)}/login`;
  const proto = (process.env.PUBLIC_URL || '').startsWith('http://') ? 'http' : req.protocol;
  const port = (req.get('host') || '').match(/:\d+$/)?.[0] || '';
  return `${proto}://${tenant.slug}.${base}${port}/login`;
};

module.exports = { publicOrigin, gymLoginUrl };
