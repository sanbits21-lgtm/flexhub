const { BadRequest } = require('./query');

// The web address members open the member app from (what the front-desk QR code and the "copy link" button give them).
// Three levels, most specific first:
//   1. the gym's own address, if its owner set one (a short link, or their own domain that redirects to the app);
//   2. the platform's address for every gym, set by the super-admin, where {slug} stands for the gym's name
//      (https://{slug}.fitzyclub.in/member gives each gym its own, https://fitzyclub.in/member gives all of them one);
//   3. the automatic address: the gym's subdomain when subdomains are on, otherwise the main site's /member.
// It is only what the QR and the link point to. Emails still use the real hosted address, because they must reach this server.

const MAX_LENGTH = 300;
const LOCAL = new Set(['localhost', '127.0.0.1']);

/** Checks a typed address and returns it trimmed, or '' when empty. `template` allows {slug}. */
const cleanAddress = (value, { template = false } = {}) => {
  const v = String(value ?? '').trim();
  if (!v) return '';
  if (v.length > MAX_LENGTH) throw new BadRequest(`The address must be ${MAX_LENGTH} characters or fewer.`);
  if (/\s/.test(v)) throw new BadRequest('The address cannot contain spaces.');
  if (!template && /[{}]/.test(v)) throw new BadRequest('{slug} can only be used in the platform-wide address.');
  const probe = template ? v.replace(/\{slug\}/g, 'gym') : v;
  if (/[{}]/.test(probe)) throw new BadRequest('Only {slug} is allowed between curly brackets.');
  let url;
  try { url = new URL(probe); } catch { throw new BadRequest('Enter a full web address, starting with https://'); }
  const okProtocol = url.protocol === 'https:' || (url.protocol === 'http:' && LOCAL.has(url.hostname));
  if (!okProtocol) throw new BadRequest('The address must start with https://');
  if (url.username || url.password) throw new BadRequest('The address must not contain a user name or password.');
  return v;
};

const fill = (template, tenant) => template.replace(/\{slug\}/g, tenant.slug);

/** Which address wins for this gym, and where it came from: 'gym', 'platform' or 'automatic'. */
const resolveMemberAppLink = ({ tenant, platformTemplate, automatic }) => {
  if (tenant.memberAppUrl) return { url: tenant.memberAppUrl, source: 'gym' };
  if (platformTemplate) return { url: fill(platformTemplate, tenant), source: 'platform' };
  return { url: automatic, source: 'automatic' };
};

module.exports = { cleanAddress, resolveMemberAppLink, fill, MAX_LENGTH };
