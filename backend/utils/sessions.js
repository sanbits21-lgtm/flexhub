const crypto = require('crypto');
const Session = require('../models/Session');
const User = require('../models/User');
const Member = require('../models/Member');
const Tenant = require('../models/Tenant');
const generateToken = require('./generateToken');
const { approvalBlock } = require('./subscription');

const DAY = 86400000;
const positive = (name, fallback) => (Number(process.env[name]) > 0 ? Number(process.env[name]) : fallback);
// Refresh tokens last this long when unused, and a login can be kept alive for at most MAX days.
const REFRESH_DAYS = () => positive('REFRESH_TOKEN_DAYS', 30);
const REFRESH_MAX_DAYS = () => positive('REFRESH_MAX_DAYS', 180);
// A token swapped a moment ago may legitimately arrive again (a lost response, two tabs, a
// double tap). Inside this window it is accepted; after it, reuse means theft.
const GRACE_MS = () => positive('REFRESH_GRACE_SECONDS', 20) * 1000;
const RETIRED_KEEP_MS = DAY;

const hash = (raw) => crypto.createHash('sha256').update(raw).digest('hex');
const newRaw = () => crypto.randomBytes(32).toString('base64url');

// Web sessions keep the refresh token in an httpOnly cookie that page scripts cannot read; the
// native app cannot use cookies and sends `X-Client: native` to get it in the response instead.
// The cookie is only ever sent to its own endpoints (Path), one per kind of person.
const COOKIES = { user: { name: 'fh_rt', path: '/api/auth' }, member: { name: 'fh_mrt', path: '/api/member-auth' } };
const isNative = (req) => String(req.get('x-client') || '').toLowerCase() === 'native';

const readCookie = (req, name) => {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return undefined; }
    }
  }
  return undefined;
};

const cookieOptions = (req, actorType) => ({ httpOnly: true, secure: !!req.secure, sameSite: 'strict', path: COOKIES[actorType].path });
const clearCookie = (req, res, actorType) => res.clearCookie(COOKIES[actorType].name, cookieOptions(req, actorType));

/** Starts (or continues, with `family`) a session; returns the access token and the raw refresh token. */
const startSession = async (actorType, actor, req, family) => {
  const now = new Date();
  const raw = newRaw();
  const session = await Session.create({
    actorType,
    actorId: actor._id,
    familyId: family?.familyId || crypto.randomBytes(12).toString('hex'),
    tokenHash: hash(raw),
    startedAt: family?.startedAt || now,
    expiresAt: new Date(now.getTime() + REFRESH_DAYS() * DAY),
    userAgent: String(req.get('user-agent') || '').slice(0, 200),
    ip: String(req.ip || '').slice(0, 64),
  });
  return { token: generateToken(actor._id, actorType, session._id), refreshToken: raw, expiresAt: session.expiresAt, sessionId: session._id };
};

/** What goes in the response body (and cookie) after a login or refresh. */
const deliver = (req, res, actorType, issued) => {
  if (isNative(req)) return { token: issued.token, refreshToken: issued.refreshToken };
  res.cookie(COOKIES[actorType].name, issued.refreshToken, { ...cookieOptions(req, actorType), expires: issued.expiresAt });
  return { token: issued.token };
};

const fail = (status, code, message) => ({ ok: false, status, code, message });

/**
 * Swaps a refresh token for a new access + refresh pair. Re-checks everything login checks, so a
 * person who was deactivated, moved off this gym's address, or whose gym was suspended cannot
 * quietly stay signed in.
 */
const rotate = async (raw, actorType, req) => {
  const now = new Date();
  const session = await Session.findOne({ tokenHash: hash(raw), actorType });
  if (!session) return fail(401, 'REFRESH_INVALID', 'Please sign in again.');
  if (session.expiresAt <= now || now - session.startedAt > REFRESH_MAX_DAYS() * DAY) {
    await Session.deleteMany({ familyId: session.familyId });
    return fail(401, 'REFRESH_EXPIRED', 'Your session has expired. Please sign in again.');
  }
  if (session.rotatedAt && now - session.rotatedAt > GRACE_MS()) {
    // An old token came back after its replacement was already in use: assume it was copied.
    await Session.deleteMany({ familyId: session.familyId });
    return fail(401, 'REFRESH_REUSED', 'Your session ended for your safety. Please sign in again.');
  }

  const actor = await (actorType === 'user' ? User : Member).findById(session.actorId);
  if (!actor || !actor.isActive) {
    await Session.deleteMany({ familyId: session.familyId });
    return fail(401, 'REFRESH_INVALID', 'Please sign in again.');
  }
  if (actor.tenantId) {
    if (req.unknownHost || (req.hostTenant && String(actor.tenantId) !== String(req.hostTenant._id))) {
      return fail(401, 'REFRESH_INVALID', 'Please sign in again.');
    }
    if (actorType === 'user' && actor.emailVerified === false) return fail(403, 'EMAIL_NOT_VERIFIED', 'Please confirm your email first.');
    const tenant = await Tenant.findById(actor.tenantId).select('isActive billingStatus approvalStatus');
    const blocked = tenant && approvalBlock(tenant);
    if (blocked) return fail(blocked.status, blocked.code, blocked.message);
    if (tenant && (!tenant.isActive || ['suspended', 'cancelled'].includes(tenant.billingStatus))) {
      return fail(403, 'GYM_SUSPENDED', 'This gym account is suspended. Please contact support.');
    }
  }

  if (!session.rotatedAt) {
    session.rotatedAt = now;
    session.expiresAt = new Date(Math.min(session.expiresAt.getTime(), now.getTime() + RETIRED_KEEP_MS));
    await session.save();
  }
  const issued = await startSession(actorType, actor, req, { familyId: session.familyId, startedAt: session.startedAt });
  return { ok: true, actor, issued };
};

/** The refresh token in a request: the native app sends it in the body, the web in its cookie. */
const readRefresh = (req, actorType) => {
  const fromBody = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : undefined;
  if (fromBody && isNative(req)) return { raw: fromBody };
  const fromCookie = readCookie(req, COOKIES[actorType].name);
  if (!fromCookie) return { error: fail(401, 'NO_REFRESH', 'Not signed in.') };
  // A cookie travels with any request to this site, so require a header a foreign page cannot set.
  if (req.get('x-requested-with') !== 'flexhub') return { error: fail(403, 'CSRF', 'Request not allowed.') };
  return { raw: fromCookie };
};

const refreshHandler = (actorType) => async (req, res) => {
  const found = readRefresh(req, actorType);
  if (found.error) return res.status(found.error.status).json({ message: found.error.message, code: found.error.code });
  const out = await rotate(found.raw, actorType, req);
  if (!out.ok) {
    if (out.status === 401) clearCookie(req, res, actorType);
    return res.status(out.status).json({ message: out.message, code: out.code });
  }
  res.json(deliver(req, res, actorType, out.issued));
};

/** Ends this login on this device. Always answers ok: signing out must never fail. */
const logoutHandler = (actorType) => async (req, res) => {
  const found = readRefresh(req, actorType);
  if (found.raw) {
    const session = await Session.findOne({ tokenHash: hash(found.raw), actorType }).select('familyId');
    if (session) await Session.deleteMany({ familyId: session.familyId });
  }
  clearCookie(req, res, actorType);
  res.json({ ok: true });
};

/** Ends every login of one person, optionally keeping the family of the session making the request. */
const revokeActor = async (actorType, actorId, keepSessionId) => {
  const filter = { actorType, actorId };
  if (keepSessionId) {
    const keep = await Session.findById(keepSessionId).select('familyId');
    if (keep) filter.familyId = { $ne: keep.familyId };
  }
  return Session.deleteMany(filter);
};

const logoutAllHandler = (actorType) => async (req, res) => {
  const actor = actorType === 'user' ? req.user : req.member;
  if (req.actorType !== actorType || !actor) return res.status(403).json({ message: 'Forbidden' });
  await revokeActor(actorType, actor._id);
  clearCookie(req, res, actorType);
  res.json({ ok: true });
};

module.exports = { startSession, deliver, rotate, refreshHandler, logoutHandler, logoutAllHandler, revokeActor, hash, COOKIES, readCookie };
