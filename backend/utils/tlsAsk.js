const Tenant = require('../models/Tenant');
const { labelFromHost, RESERVED, baseDomain } = require('./subdomain');

// "May the proxy get an HTTPS certificate for this name?" (Caddy's on-demand TLS asks this before it asks Let's Encrypt.)
//
// Every gym has its own address (iron.fitzyclub.in). Instead of one wildcard certificate, which needs a DNS provider plugin and API
// token, the proxy fetches a certificate the first time a gym's address is visited. Without a check anyone could point made-up names
// at the server and make it request certificates until Let's Encrypt's limits are hit. So the answer is yes only for:
//   - the main address (PUBLIC_URL's host, and BASE_DOMAIN itself), and
//   - the address of a gym that exists (its current slug, or an old slug still redirecting).
// Nothing else: not reserved names (www, api, admin), not names several levels deep, not other domains.

const hostOf = (url) => { try { return new URL(url).hostname.toLowerCase(); } catch { return ''; } };

/** True when `domain` is one the proxy may get a certificate for. */
const isAllowedDomain = async (domain) => {
  const name = String(domain || '').trim().toLowerCase().replace(/\.$/, '');
  if (!name || name.length > 253 || !/^[a-z0-9.-]+$/.test(name)) return false;

  const base = baseDomain();
  if (name === base || name === hostOf(process.env.PUBLIC_URL)) return true;

  const label = labelFromHost(name); // null unless it is exactly one label under BASE_DOMAIN
  if (!label || RESERVED.has(label)) return false;
  const now = new Date();
  return !!(await Tenant.exists({ $or: [{ slug: label }, { previousSlugs: { $elemMatch: { slug: label, until: { $gt: now } } } }] }));
};

module.exports = { isAllowedDomain };
