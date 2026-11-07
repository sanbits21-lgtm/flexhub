const Member = require('../models/Member');
const Tenant = require('../models/Tenant');
const generateToken = require('../utils/generateToken');
const { resolveFeatures } = require('../utils/features');
const { publicBrand } = require('../utils/subdomain');

exports.login = async (req, res) => {
  // identifier is an email or a member code (not every member has an email); email
  // stays accepted so existing clients keep working.
  const { identifier, email, password } = req.body;
  if (req.unknownHost) return res.status(401).json({ message: 'Invalid credentials' });
  const id = String(identifier || email || '').trim();
  // An email is unique within a gym, not across gyms, so it can match several members; the
  // password (or a member code, which is globally unique) decides which one this is.
  let member = null;
  if (id && typeof password === 'string') {
    const filter = id.includes('@') ? { email: id.toLowerCase(), isActive: true } : { memberCode: id, isActive: true };
    // On a gym's own address, only that gym's members can match.
    if (req.hostTenant) filter.tenantId = req.hostTenant._id;
    const candidates = await Member.find(filter).limit(10);
    for (const c of candidates) {
      if (await c.matchPassword(password)) { member = c; break; }
    }
  }
  if (!member) return res.status(401).json({ message: 'Invalid credentials' });
  const tenant = await Tenant.findById(member.tenantId).select('features name slug brand');
  res.json({
    features: resolveFeatures(tenant),
    brand: publicBrand(tenant),
    token: generateToken(member._id, 'member'),
    member: {
      _id: member._id,
      name: member.name,
      email: member.email,
      memberCode: member.memberCode,
      tenantId: member.tenantId,
      branchId: member.branchId,
      membershipStatus: member.membershipStatus,
    },
  });
};

exports.getMe = async (req, res) => {
  const tenant = await Tenant.findById(req.member.tenantId).select('features name slug brand');
  res.json({ member: req.member, features: resolveFeatures(tenant), brand: publicBrand(tenant) });
};
