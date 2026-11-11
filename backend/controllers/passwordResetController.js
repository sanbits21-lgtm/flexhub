const crypto = require('crypto');
const User = require('../models/User');
const Member = require('../models/Member');
const Tenant = require('../models/Tenant');
const AuditLog = require('../models/AuditLog');
const { templated } = require('../utils/mailer');
const { gymUrl, publicOrigin } = require('../utils/links');
const { passwordProblem } = require('../utils/passwordPolicy');
const { revokeActor } = require('../utils/sessions');
const throttle = require('../utils/loginThrottle');

// "Forgot password" by email, for staff and for members.
//
// * The request always gets the same answer, whether or not the account exists, so it cannot be used
//   to find out who has an account. Only a real, active account with an email address is emailed.
// * The emailed link carries a random 256-bit token. Only its hash is stored, it works once, and it
//   expires after an hour. Asking again replaces it (the older link stops working).
// * An account is emailed at most once a minute, so this cannot be used to flood an inbox.
// * Resetting ends every login of that person, clears a sign-in lock, and tells them by email.

const RESET_MINUTES = 60;
const GAP_MS = 60 * 1000;

const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
const KINDS = { user: { Model: User, actorRole: null }, member: { Model: Member, actorRole: 'member' } };

// Stores a fresh token on the account unless one was issued less than a minute ago. Atomic, so two
// simultaneous requests send one email, not two. Returns the raw token to email, or null.
const issue = async (Model, id) => {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const doc = await Model.findOneAndUpdate(
    { _id: id, $or: [{ passwordResetRequestedAt: { $exists: false } }, { passwordResetRequestedAt: null }, { passwordResetRequestedAt: { $lt: new Date(now.getTime() - GAP_MS) } }] },
    { $set: { passwordResetTokenHash: sha256(token), passwordResetTokenExpires: new Date(now.getTime() + RESET_MINUTES * 60000), passwordResetRequestedAt: now } },
    { new: true },
  ).select('_id').lean();
  return doc ? token : null;
};

const tenantOf = (tenantId) => (tenantId ? Tenant.findById(tenantId).select('name slug').lean() : null);

const sendLink = async (req, kind, doc, token) => {
  const tenant = await tenantOf(doc.tenantId);
  const path = kind === 'member' ? '/member/reset-password' : '/reset-password';
  // On the gym's own address when it has one (platform staff have no gym: the main site).
  const url = `${tenant ? gymUrl(tenant, req, path) : `${publicOrigin(req)}${path}`}?token=${token}`;
  const who = kind === 'member' ? `member ID ${doc.memberCode}` : doc.email;
  await templated({
    to: doc.email,
    subject: 'Reset your password',
    heading: `Reset the password for ${who}`,
    body: `Someone asked to reset the password for ${who}${tenant ? ` at ${tenant.name}` : ''}. The link works once and for ${RESET_MINUTES} minutes. If it was not you, ignore this email: your password stays as it is.`,
    buttonText: 'Choose a new password',
    buttonUrl: url,
  });
};

const later = (promise) => promise.catch((err) => console.error('password reset email failed:', err.message));

const SENT = { message: 'If there is an account for that, a link to reset the password is on its way. It can take a few minutes. Check your spam folder too.' };

// ---------- asking for a link ----------

exports.forgotStaff = async (req, res) => {
  const user = await User.findOne({ email: req.body.email.toLowerCase(), isActive: true }).select('email tenantId emailVerified');
  // An unconfirmed owner has not proved they own the address yet: they need the confirmation link, not this.
  if (user && user.emailVerified !== false) {
    const token = await issue(User, user._id);
    if (token) later(sendLink(req, 'user', user, token));
  }
  res.json(SENT);
};

exports.forgotMember = async (req, res) => {
  const id = String(req.body.identifier).trim();
  const filter = id.includes('@') ? { email: id.toLowerCase(), isActive: true } : { memberCode: id, isActive: true };
  if (req.hostTenant) filter.tenantId = req.hostTenant._id; // on a gym's own address, only its members
  // An email is unique within a gym, not across gyms (or within a family sharing one), so several members can match: each gets their own link.
  // $and, not a merge: when the person typed an email, `filter` already constrains `email`, and a second `email` key would replace it.
  const members = await Member.find({ $and: [filter, { email: { $exists: true, $nin: ['', null] } }] }).select('email memberCode tenantId').limit(5);
  for (const member of members) {
    const token = await issue(Member, member._id);
    if (token) later(sendLink(req, 'member', member, token));
  }
  res.json({ message: `${SENT.message} If you have no email address on file, ask the front desk to reset your app login.` });
};

// ---------- using the link ----------

const BAD_LINK = { code: 'LINK_INVALID', message: 'This reset link is invalid or has expired. Ask for a new one.' };

const audit = (req, kind, doc) => AuditLog.create({
  tenantId: doc.tenantId || null,
  actorId: doc._id,
  actorRole: kind === 'member' ? 'member' : doc.role,
  actorName: doc.name,
  actorEmail: doc.email,
  action: 'PASSWORD_RESET_BY_EMAIL',
  targetType: kind === 'member' ? 'Member' : 'User',
  targetId: doc._id,
  ip: req.ip,
}).catch(() => {});

const forget = async (kind, doc) => {
  // The lock is keyed by whatever the person typed to sign in, so lift it for each way they could have typed it.
  const scopes = ['', String(doc.tenantId || '')];
  const typed = kind === 'member' ? [doc.memberCode, doc.email] : [doc.email];
  await Promise.all(typed.filter(Boolean).flatMap((id) => scopes.map((s) => throttle.clear(throttle.keyFor(kind, id, s)))));
};

const reset = (kind) => async (req, res) => {
  const { Model } = KINDS[kind];
  const { token, password } = req.body;
  const doc = await Model.findOne({ passwordResetTokenHash: sha256(token), passwordResetTokenExpires: { $gt: new Date() } });
  if (!doc) return res.status(400).json(BAD_LINK);

  const weak = passwordProblem(password, doc);
  if (weak) return res.status(400).json({ message: weak });

  doc.password = password;
  // Tokens issued before this moment stop working, and every refresh token goes too: whoever had the
  // old password (or a stolen session) is signed out everywhere.
  doc.passwordResetAt = new Date();
  doc.passwordResetTokenHash = undefined;
  doc.passwordResetTokenExpires = undefined;
  await doc.save();
  await revokeActor(kind, doc._id);
  await forget(kind, doc);
  audit(req, kind, doc);
  if (doc.email) {
    later(templated({
      to: doc.email,
      subject: 'Your password was changed',
      heading: 'Your password was changed',
      body: 'The password for your account was just changed using a reset link, and you were signed out everywhere. If this was you, there is nothing to do. If it was not, ask for another reset now and tell your gym.',
    }));
  }
  res.json({ message: 'Your password is changed. You can sign in with it now.' });
};

exports.resetStaff = reset('user');
exports.resetMember = reset('member');
