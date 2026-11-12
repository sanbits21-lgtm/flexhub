const crypto = require('crypto');
const User = require('../models/User');
const mailer = require('./mailer');

// A server error nobody hears about is one the clients hear about first. When something breaks on the
// server (a request that fails with a 5xx, a crash), an email goes to whoever should know:
//   ALERT_EMAIL = comma-separated addresses, or, when empty, the platform's super-admins.
// It carries what happened and where, never a request body, headers, tokens or anyone's data.
//
// Calm by design, so an outage does not bury the inbox: the same error is sent once per 15 minutes,
// and at most 20 alerts go out in an hour.
//
// On in production, off elsewhere (ALERTS=on / off overrides either way).

const SAME_ERROR_MS = 15 * 60 * 1000;
const MAX_PER_HOUR = 20;
const seen = new Map();
let sent = [];

const enabled = () => {
  const v = String(process.env.ALERTS || '').toLowerCase();
  if (v === 'on') return true;
  if (v === 'off') return false;
  return process.env.NODE_ENV === 'production';
};

const recipients = async () => {
  const configured = String(process.env.ALERT_EMAIL || '').split(',').map((e) => e.trim()).filter(Boolean);
  if (configured.length) return configured;
  const admins = await User.find({ role: 'super-admin', isActive: true }).select('email').lean();
  return admins.map((a) => a.email);
};

const frames = (err) => String((err && err.stack) || '').split('\n').slice(0, 9).join('\n');
const signature = (err, where) => crypto.createHash('sha1').update(`${err && err.name}|${err && err.message}|${String((err && err.stack) || '').split('\n')[1] || ''}|${where}`).digest('hex');

/** Tells the right people about a server error. Never throws: an alert must not cause a second failure. */
const notifyError = async (err, where = 'server') => {
  try {
    if (!enabled()) return false;
    const now = Date.now();
    const key = signature(err, where);
    const last = seen.get(key);
    if (last && now - last < SAME_ERROR_MS) return false;
    sent = sent.filter((t) => now - t < 3600000);
    if (sent.length >= MAX_PER_HOUR) return false;
    seen.set(key, now);
    if (seen.size > 500) { for (const [k, t] of seen) if (now - t > SAME_ERROR_MS) seen.delete(k); }
    sent.push(now);

    const to = await recipients();
    if (!to.length) return false;
    const name = `${(err && err.name) || 'Error'}: ${String((err && err.message) || err).slice(0, 300)}`;
    const text = [
      `Something failed on the FitzyClub server.`,
      ``,
      `Where: ${where}`,
      `When:  ${new Date(now).toISOString()}`,
      `Error: ${name}`,
      ``,
      frames(err),
      ``,
      `The same error will not be emailed again for 15 minutes. Check the server logs for more.`,
    ].join('\n');
    await Promise.all(to.map((address) => mailer.sendMail({ to: address, subject: `FitzyClub server error: ${name.slice(0, 80)}`, text, html: `<pre style="font:13px/1.5 ui-monospace,monospace;white-space:pre-wrap">${text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</pre>` })));
    return true;
  } catch (e) {
    console.error('could not send the error alert:', e.message);
    return false;
  }
};

/** For tests. */
const reset = () => { seen.clear(); sent = []; };

module.exports = { notifyError, enabled, reset };
