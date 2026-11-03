const nodemailer = require('nodemailer');

// Outgoing email over SMTP (any provider: SES, Mailgun, Gmail app password, Brevo...).
//   SMTP_URL=smtps://user:pass@smtp.example.com   or   SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_SECURE
//   MAIL_FROM="FlexHub <no-reply@yourdomain.com>"
// With nothing configured the message is printed to the server log instead (so development
// works without a mail account) and, under test, kept in `outbox` for assertions.
const outbox = [];

const configured = () => !!(process.env.SMTP_URL || process.env.SMTP_HOST);

let transport;
const getTransport = () => {
  if (transport) return transport;
  transport = process.env.SMTP_URL
    ? nodemailer.createTransport(process.env.SMTP_URL)
    : nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  return transport;
};

const escapeHtml = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Sends one message. Never throws: a failed email must not undo the action that triggered it. Returns true if handed off. */
const sendMail = async ({ to, subject, text, html }) => {
  const from = process.env.MAIL_FROM || 'FlexHub <no-reply@localhost>';
  if (!configured()) {
    if (process.env.NODE_ENV === 'test') outbox.push({ to, subject, text, html });
    else console.log(`[mail not configured] To: ${to}\nSubject: ${subject}\n${text}\n`);
    return true;
  }
  try {
    await getTransport().sendMail({ from, to, subject, text, html });
    return true;
  } catch (err) {
    console.error('Email send failed:', err.message);
    return false;
  }
};

// A short, plain template: one heading, a paragraph, an optional button.
const layout = ({ heading, body, buttonText, buttonUrl }) => `<!doctype html><html><body style="margin:0;background:#f3f4f7;font-family:system-ui,sans-serif;color:#1b1f27">
<div style="max-width:520px;margin:0 auto;padding:24px"><div style="background:#fff;border-radius:16px;padding:28px">
<h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(heading)}</h1>
<p style="font-size:15px;line-height:1.6;margin:0 0 20px">${escapeHtml(body)}</p>
${buttonUrl ? `<p style="margin:0 0 20px"><a href="${escapeHtml(buttonUrl)}" style="background:#1b1f27;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;display:inline-block;font-weight:600">${escapeHtml(buttonText)}</a></p><p style="font-size:12px;color:#667084;word-break:break-all">${escapeHtml(buttonUrl)}</p>` : ''}
</div></div></body></html>`;

const templated = ({ to, subject, heading, body, buttonText, buttonUrl }) => sendMail({
  to, subject,
  text: `${heading}\n\n${body}${buttonUrl ? `\n\n${buttonText}: ${buttonUrl}` : ''}\n`,
  html: layout({ heading, body, buttonText, buttonUrl }),
});

module.exports = { sendMail, templated, configured, outbox, escapeHtml };
