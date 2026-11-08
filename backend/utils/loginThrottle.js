const bcrypt = require('bcryptjs');
const LoginAttempt = require('../models/LoginAttempt');

const positive = (name, fallback) => (Number(process.env[name]) > 0 ? Number(process.env[name]) : fallback);
// After this many wrong passwords inside the window the account is locked for a while. A lock
// answers the same for every account, real or not, and even the right password is refused during it.
const MAX_FAILURES = () => positive('LOGIN_MAX_FAILURES', 5);
const WINDOW_MS = () => positive('LOGIN_WINDOW_MINUTES', 15) * 60000;
const LOCK_MS = () => positive('LOGIN_LOCK_MINUTES', 15) * 60000;
const MAX_ESCALATION = 4; // 15 min, then 30, then 60, and 60 from there on
const KEEP_MS = 24 * 3600000;

const keyFor = (kind, identifier, scope = '') => `${kind}:${scope}:${String(identifier || '').trim().toLowerCase().slice(0, 200)}`;

/** Is this account locked right now? */
const check = async (key) => {
  const doc = await LoginAttempt.findOne({ key }).select('lockedUntil').lean();
  const now = Date.now();
  if (doc?.lockedUntil && doc.lockedUntil.getTime() > now) return { locked: true, retryAfterSec: Math.ceil((doc.lockedUntil.getTime() - now) / 1000) };
  return { locked: false };
};

const bump = (key, now) => LoginAttempt.findOneAndUpdate(
  { key },
  { $inc: { failures: 1 }, $setOnInsert: { windowStart: now }, $set: { expiresAt: new Date(now.getTime() + KEEP_MS) } },
  { upsert: true, new: true },
);

/** Counts one wrong password; locks the account when it reaches the limit. */
const fail = async (key) => {
  const now = new Date();
  // Failures from an old window no longer count (but never reopen a lock that is still running).
  await LoginAttempt.updateOne(
    { key, windowStart: { $lt: new Date(now.getTime() - WINDOW_MS()) }, $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: { $lte: now } }] },
    { $set: { failures: 0, windowStart: now } },
  );
  let doc;
  try { doc = await bump(key, now); } catch (err) {
    if (err.code !== 11000) throw err; // two first failures raced to create the row: the other won, count on it
    doc = await bump(key, now);
  }
  if (doc.failures >= MAX_FAILURES() && !(doc.lockedUntil && doc.lockedUntil > now)) {
    const factor = Math.min(2 ** doc.lockCount, MAX_ESCALATION);
    // The failures filter makes parallel attempts lock once, not once each.
    await LoginAttempt.updateOne(
      { key, failures: { $gte: MAX_FAILURES() } },
      { $set: { lockedUntil: new Date(now.getTime() + LOCK_MS() * factor), failures: 0, windowStart: now }, $inc: { lockCount: 1 } },
    );
  }
};

/** A correct password wipes the slate. */
const clear = (key) => LoginAttempt.deleteOne({ key });

// Checking a password costs real time. When there is no such account the check is still done
// (against a throwaway hash) so the answer takes as long, and response time cannot be used to
// tell which email addresses have accounts.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);
const burn = (password) => bcrypt.compare(String(password ?? ''), DUMMY_HASH);

/** The one answer for a locked account. */
const lockedResponse = (res, lock) => {
  const minutes = Math.max(1, Math.ceil(lock.retryAfterSec / 60));
  return res.set('Retry-After', String(lock.retryAfterSec)).status(429).json({
    code: 'LOGIN_LOCKED',
    message: `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    retryAfterSeconds: lock.retryAfterSec,
  });
};

module.exports = { keyFor, check, fail, clear, burn, lockedResponse };
