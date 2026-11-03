const Tenant = require('../models/Tenant');
const { labelFromHost, RESERVED } = require('../utils/subdomain');

/**
 * Works out which gym a request is for from its host name (iron.example.com -> "iron") and
 * sets req.hostTenant. It never grants access by itself: login uses it to keep a gym's
 * people on their own address, and the public endpoint uses it to brand the login page.
 *
 * A gym that renamed itself keeps answering on its old address for a while: browser
 * navigations are redirected to the new one, API calls keep working so open sessions survive.
 */
module.exports = async (req, res, next) => {
  const label = labelFromHost(req.hostname);
  if (!label || RESERVED.has(label)) return next();

  const now = new Date();
  const tenant = await Tenant.findOne({ $or: [{ slug: label }, { previousSlugs: { $elemMatch: { slug: label, until: { $gt: now } } } }] })
    .select('name slug brand isActive');
  if (!tenant) { req.unknownHost = label; return next(); }
  req.hostTenant = tenant;

  const isOldAddress = tenant.slug !== label;
  const isPage = req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/health');
  if (isOldAddress && isPage) {
    // Keep the rest of the host (domain and any port) exactly as the client sent it.
    const rest = req.get('host').slice(label.length);
    return res.redirect(301, `${req.protocol}://${tenant.slug}${rest}${req.originalUrl}`);
  }
  next();
};
