const crypto = require('crypto');
const Tenant = require('../models/Tenant');
const SubscriptionPackage = require('../models/SubscriptionPackage');
const User = require('../models/User');
const Branch = require('../models/Branch');
const AuditLog = require('../models/AuditLog');
const { cleanSlug, isSlugFree, RESERVED } = require('../utils/subdomain');
const { getSettings } = require('../utils/platformSettings');
const { templated, configured: mailConfigured } = require('../utils/mailer');
const { publicOrigin } = require('../utils/links');
const { activePackages } = require('./packageController');
const { TERMS_VERSION, termsRequired } = require('../utils/terms');

const VERIFY_HOURS = 24;
const RESEND_GAP_MS = 60 * 1000;
const NOTICE_GAP_MS = 10 * 60 * 1000;

// Registering answers the same whether or not the email already has an account. Saying "that email
// is taken" would let anyone check who uses FitzyClub; the address's owner hears about it by email.
const signupReply = (email) => ({ email, message: 'Check your email to confirm your address.' });

const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('hex');

// "Iron Hub Fitness!" -> "iron-hub-fitness"; always a legal, unreserved, unused address.
const suggestSlug = async (gymName) => {
  let base = gymName.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24).replace(/-+$/g, '');
  if (base.length < 3) base = `gym-${base}`.replace(/-+$/g, '');
  if (RESERVED.has(base)) base = `${base}-gym`;
  for (let i = 0; i < 30; i += 1) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    try {
      const slug = cleanSlug(candidate);
      if (await isSlugFree(slug)) return slug;
    } catch { /* try the next candidate */ }
  }
  return cleanSlug(`${base.slice(0, 18)}-${Math.random().toString(36).slice(2, 8)}`);
};

const sendVerification = (req, user, token, gymName) => templated({
  to: user.email,
  subject: 'Confirm your email for FitzyClub',
  heading: `Welcome to FitzyClub, ${user.name}`,
  body: `Please confirm your email address to finish registering ${gymName}. The link works for ${VERIFY_HOURS} hours. After that, our team reviews new gyms and we will email you as soon as yours is approved.`,
  buttonText: 'Confirm my email',
  buttonUrl: `${publicOrigin(req)}/verify-email?token=${token}`,
});

// Staff who can act on a registration are told when one is ready (email confirmed).
const notifyPlatformStaff = async (req, tenant, owner) => {
  const staff = await User.find({ role: { $in: ['super-admin', 'platform-admin'] }, isActive: true }).select('email').lean();
  const pkg = tenant.requestedPackageId ? await SubscriptionPackage.findById(tenant.requestedPackageId).select('name').lean() : null;
  await Promise.all(staff.map((s) => templated({
    to: s.email,
    subject: `New gym awaiting approval: ${tenant.name}`,
    heading: 'A new gym is waiting for approval',
    body: `${tenant.name} (owner: ${owner.name}, ${owner.email}, ${tenant.contactPhone || 'no phone'}) has confirmed their email${pkg ? ` and chose the ${pkg.name} package` : ''}. Review it under Tenants > Pending approval.`,
    buttonText: 'Open Tenants',
    buttonUrl: `${publicOrigin(req)}/tenants`,
  })));
};

// What the signup page asks before showing the form. Closed in production when no mail
// server is configured: a gym could register but never receive its confirmation link.
exports.config = async (req, res) => {
  const s = await getSettings();
  const deliverable = mailConfigured() || process.env.NODE_ENV !== 'production';
  const enabled = s.selfSignupEnabled && deliverable && !req.hostTenant && !req.unknownHost;
  // With packages on offer the page shows them and each package carries its own terms;
  // the platform-wide trial numbers are only the fallback when none are set up.
  const packages = enabled ? await activePackages() : [];
  res.json({ enabled, trialDays: s.trialDays, maxMembers: s.trialMaxMembers, maxBranches: s.trialMaxBranches, packages });
};

/**
 * Registers a gym in a waiting state. Nobody is signed in: the owner must confirm their email
 * and then a platform administrator must approve the gym before anything works. The trial
 * clock starts at approval, not now, so waiting costs the gym nothing.
 */
exports.signup = async (req, res) => {
  const settings = await getSettings();
  if (!settings.selfSignupEnabled || req.hostTenant || req.unknownHost) {
    return res.status(404).json({ message: 'Sign-up is not available here.' });
  }
  if (!mailConfigured() && process.env.NODE_ENV === 'production') {
    return res.status(503).json({ message: 'Sign-up is temporarily unavailable.' });
  }
  const { gymName, ownerName, email, phone, password, slug: requestedSlug, website, packageId, acceptTerms } = req.body;
  if (website) return res.status(400).json({ message: 'Could not create your account.' }); // honeypot
  // Agreeing is part of registering. Checked on the input alone, so it says nothing about whether the email already has an account.
  if (termsRequired() && acceptTerms !== true) {
    return res.status(400).json({ message: 'Please accept the Terms of Service and the Privacy Policy to register.', code: 'TERMS_REQUIRED' });
  }

  // Once any package is on offer, choosing one is part of registering; it must be one still offered.
  const offered = await activePackages();
  const chosen = packageId ? offered.find((p) => String(p._id) === String(packageId)) : undefined;
  if (offered.length && !chosen) {
    return res.status(400).json({ message: packageId ? 'That package is no longer available. Please choose another.' : 'Please choose a package.', code: 'PACKAGE_REQUIRED' });
  }
  if (!offered.length && packageId) return res.status(400).json({ message: 'That package is no longer available.', code: 'PACKAGE_REQUIRED' });

  const cleanEmail = email.toLowerCase();
  const existing = await User.findOne({ email: cleanEmail }).select('emailVerified emailVerifySentAt tenantId accountNoticeSentAt email');
  if (existing) {
    await noticeToExistingAccount(req, existing);
    return res.status(201).json(signupReply(cleanEmail));
  }

  let slug;
  if (requestedSlug) {
    slug = cleanSlug(requestedSlug);
    if (!(await isSlugFree(slug))) return res.status(409).json({ message: 'That address is already taken.' });
  } else {
    slug = await suggestSlug(gymName);
  }

  const token = newToken();
  const created = [];
  try {
    const tenant = await Tenant.create({
      name: gymName, slug, contactEmail: cleanEmail, contactPhone: phone,
      billingPlan: 'trial', billingStatus: 'active',
      maxBranches: chosen ? chosen.maxBranches : settings.trialMaxBranches,
      maxMembers: chosen ? chosen.maxMembers : settings.trialMaxMembers,
      requestedPackageId: chosen ? chosen._id : undefined,
      approvalStatus: 'pending', signupSource: 'self',
    });
    created.push(tenant);
    created.push(await Branch.create({ tenantId: tenant._id, name: 'Main branch', phone }));
    const user = await User.create({
      name: ownerName, email: cleanEmail, phone, password, role: 'tenant-admin', tenantId: tenant._id,
      termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION,
      emailVerified: false, emailVerifyHash: sha256(token), emailVerifyExpires: new Date(Date.now() + VERIFY_HOURS * 3600000), emailVerifySentAt: new Date(),
    });
    created.push(user);

    if (!(await sendVerification(req, user, token, gymName))) {
      throw Object.assign(new Error('mail'), { mail: true });
    }
    await AuditLog.create({
      tenantId: tenant._id, actorId: user._id, actorRole: 'tenant-admin', actorName: user.name, actorEmail: user.email,
      action: 'SELF_SIGNUP', targetType: 'Tenant', targetId: tenant._id, metadata: { slug }, ip: req.ip,
    }).catch(() => {});
    res.status(201).json(signupReply(cleanEmail));
  } catch (err) {
    // No transactions in this codebase: undo whatever was created so a half-made gym never lingers.
    await Promise.all(created.map((doc) => doc.constructor.deleteOne({ _id: doc._id }).catch(() => {})));
    if (err.mail) return res.status(503).json({ message: "We couldn't send your confirmation email. Please try again in a few minutes." });
    if (err.code === 11000) {
      // Two sign-ups with one email at the same moment: the other one won. Answer as for any sign-up.
      if (!err.keyPattern || !err.keyPattern.slug) return res.status(201).json(signupReply(cleanEmail));
      return res.status(409).json({ message: 'That address is already taken.' });
    }
    throw err;
  }
};

// The link in the email. Safe to open twice.
exports.verifyEmail = async (req, res) => {
  const user = await User.findOne({ emailVerifyHash: sha256(req.body.token) });
  if (!user || (user.emailVerified === false && user.emailVerifyExpires < new Date())) {
    return res.status(400).json({ message: 'This confirmation link is invalid or has expired. Request a new one.', code: 'LINK_INVALID' });
  }
  const tenant = await Tenant.findById(user.tenantId);
  if (user.emailVerified !== false) return res.json({ verified: true, already: true, approvalStatus: tenant?.approvalStatus });

  user.emailVerified = true;
  user.emailVerifyExpires = undefined;
  await user.save();
  if (tenant && tenant.approvalStatus === 'pending') notifyPlatformStaff(req, tenant, user).catch((e) => console.error('notify failed:', e.message));
  AuditLog.create({ tenantId: user.tenantId, actorId: user._id, actorRole: 'tenant-admin', actorName: user.name, actorEmail: user.email, action: 'EMAIL_VERIFIED', ip: req.ip }).catch(() => {});
  res.json({ verified: true, approvalStatus: tenant?.approvalStatus });
};

// A new confirmation link for an owner who has not confirmed yet (at most one a minute).
const reissueVerification = async (req, user) => {
  if (user.emailVerifySentAt && Date.now() - user.emailVerifySentAt.getTime() < RESEND_GAP_MS) return;
  const tenant = await Tenant.findById(user.tenantId).select('name approvalStatus');
  if (!tenant || tenant.approvalStatus !== 'pending') return;
  const token = newToken();
  user.emailVerifyHash = sha256(token);
  user.emailVerifyExpires = new Date(Date.now() + VERIFY_HOURS * 3600000);
  user.emailVerifySentAt = new Date();
  await user.save();
  await sendVerification(req, user, token, tenant.name);
};

// Someone registered with an address that already has an account. Nothing is created. If the
// account is still waiting for its confirmation, that link is sent again; otherwise the owner is
// told they already have an account (at most once every ten minutes, so this cannot be used to
// flood an inbox).
const noticeToExistingAccount = async (req, user) => {
  if (user.emailVerified === false) return reissueVerification(req, user);
  if (user.accountNoticeSentAt && Date.now() - user.accountNoticeSentAt.getTime() < NOTICE_GAP_MS) return undefined;
  await User.updateOne({ _id: user._id }, { accountNoticeSentAt: new Date() });
  return templated({
    to: user.email,
    subject: 'You already have a FitzyClub account',
    heading: 'You already have an account',
    body: 'Someone, hopefully you, tried to register a new gym with this email address. Because it already has a FitzyClub account, nothing was created. If it was you, just sign in. If it was not, you can ignore this email.',
    buttonText: 'Sign in',
    buttonUrl: `${publicOrigin(req)}/login`,
  });
};

// Always answers the same, so it cannot be used to find out who has registered.
exports.resend = async (req, res) => {
  const reply = { message: 'If that address is waiting for confirmation, a new link is on its way.' };
  const user = await User.findOne({ email: req.body.email.toLowerCase(), emailVerified: false });
  if (user) await reissueVerification(req, user);
  res.json(reply);
};
