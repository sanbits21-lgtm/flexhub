const { getSettings, updateSettings } = require('../utils/platformSettings');
const { logAudit } = require('../utils/audit');
const { mailStatus, verifyMail, templated } = require('../utils/mailer');

exports.get = async (req, res) => res.json(await getSettings());

exports.update = async (req, res) => {
  const before = await getSettings();
  const after = await updateSettings(req.body || {}, req.user._id);
  const changed = Object.fromEntries(Object.keys(after).filter((k) => before[k] !== after[k]).map((k) => [k, { from: before[k], to: after[k] }]));
  logAudit(req, 'UPDATE_PLATFORM_SETTINGS', { metadata: { changed } });
  res.json(after);
};

// Is email working? Sign-up cannot work without it, and a failure used to be visible only in the
// server log. Super-admin only; nothing secret is ever returned.
exports.emailStatus = async (req, res) => {
  const status = mailStatus();
  // Reaching the server and logging in, without sending anything.
  const check = status.configured && !status.urlProblem ? await verifyMail() : null;
  res.json({ ...status, check });
};

// Sends a real message to the signed-in super-admin and says exactly what happened.
exports.sendTestEmail = async (req, res) => {
  const status = mailStatus();
  if (!status.configured) {
    return res.json({ ok: false, to: req.user.email, hint: 'No mail settings found. Set SMTP_URL (or SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS) and MAIL_FROM, then redeploy.' });
  }
  const check = await verifyMail();
  if (!check.ok) return res.json({ ...check, to: req.user.email });
  const sent = await templated({
    to: req.user.email,
    subject: 'FlexHub test email',
    heading: 'Email is working',
    body: 'This is a test message from your FlexHub platform settings. If you can read it, sign-up confirmations and approval emails will be delivered.',
  });
  logAudit(req, 'SEND_TEST_EMAIL', { metadata: { ok: sent } });
  if (!sent) return res.json({ ok: false, to: req.user.email, ...(mailStatus().lastFailure || {}) });
  res.json({ ok: true, to: req.user.email });
};
