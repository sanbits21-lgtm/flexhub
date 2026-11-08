const nodemailer = require('nodemailer');

// Outgoing email over SMTP (any provider: SES, Mailgun, Gmail app password, Brevo...).
//   SMTP_URL=smtps://user:pass@smtp.example.com   or   SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_SECURE
//   MAIL_FROM="FlexHub <no-reply@yourdomain.com>"
// With nothing configured the message is printed to the server log instead (so development
// works without a mail account) and, under test, kept in `outbox` for assertions.
const outbox = [];

// Two ways to send. BREVO_API_KEY uses Brevo's web API (one key, ordinary HTTPS, so no host blocks
// it the way many block the SMTP ports). SMTP_URL / SMTP_HOST use any SMTP provider. The API wins
// when both are set.
const apiConfigured = () => !!String(process.env.BREVO_API_KEY || '').trim();
const configured = () => apiConfigured() || !!(process.env.SMTP_URL || process.env.SMTP_HOST);

// How long to wait for the mail server before giving up. nodemailer's own defaults are two minutes,
// which is how a blocked port (the connection is silently dropped) looked like a frozen page.
// MAIL_TIMEOUT_SECONDS adjusts it (default 10).
const timeouts = () => {
  const ms = (Number(process.env.MAIL_TIMEOUT_SECONDS) > 0 ? Number(process.env.MAIL_TIMEOUT_SECONDS) : 10) * 1000;
  return { connectionTimeout: ms, greetingTimeout: ms, socketTimeout: ms * 2 };
};

let transport;
const getTransport = () => {
  if (transport) return transport;
  transport = process.env.SMTP_URL
    ? nodemailer.createTransport({ url: process.env.SMTP_URL, ...timeouts() })
    : nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      ...timeouts(),
    });
  return transport;
};

/**
 * Turns a mail-server failure into what to DO about it. The raw errors ("535 5.7.8", "ETIMEDOUT",
 * "Greeting never received") mean little to whoever set up the deployment.
 */
const describeApiError = (code, status, text) => {
  if (/ip address|unrecogni[sz]ed|authori[sz]ed ip/i.test(text)) {
    return "Brevo blocked this server's address. In Brevo go to Security > Authorised IPs and deactivate the blocking (the host's outgoing address changes, so it cannot be listed).";
  }
  if (code === 'EAPIAUTH' || status === 401) {
    return 'Brevo rejected the API key. Create one under SMTP & API > API Keys (it starts with xkeysib-). An SMTP key (xsmtpsib-) or your account password will not work here.';
  }
  if (/sender/i.test(text)) return 'Brevo refused the sender address. MAIL_FROM must be a sender you have verified in Brevo (Senders, Domains & Dedicated IPs > Senders).';
  if (status === 403) return `Brevo refused the request: ${text.slice(0, 200)} If your account is new it may still be under review; Brevo support can activate sending.`;
  if (code === 'ETIMEDOUT') return 'Brevo did not answer in time. Check the server can reach the internet, then try again.';
  if (code === 'ECONNECT') return 'The server could not reach api.brevo.com. Check outgoing internet access from the host.';
  return text.slice(0, 300) || 'Brevo returned an error.';
};

const describeMailError = (err) => {
  const code = String(err?.code || '');
  const text = String(err?.message || (typeof err === 'string' ? err : ''));
  const reply = Number(err?.responseCode) || 0;
  if (code === 'EAPI' || code === 'EAPIAUTH' || code === 'ECONNECT' || err?.api) return describeApiError(code, reply, text);
  if (code === 'EAUTH' || reply === 535 || /invalid login|authentication (failed|unsuccessful)|username and password not accepted/i.test(text)) {
    return 'The mail server rejected the username or password. Check SMTP_URL (or SMTP_USER / SMTP_PASS). Many providers need an API key or app password, not your normal login, and special characters in a password inside SMTP_URL must be percent-encoded (@ becomes %40, # becomes %23).';
  }
  if (/greeting never received|wrong version number|ssl3_get_record|EPROTO/i.test(code + text)) {
    return 'The port and the security setting do not match. Port 465 needs smtps:// (or SMTP_SECURE=true); ports 587 and 2525 use smtp:// with STARTTLS (SMTP_SECURE=false).';
  }
  if (['ECONNREFUSED', 'ETIMEDOUT', 'ESOCKET', 'ECONNECTION', 'ENOTFOUND', 'EDNS', 'ECONNRESET'].includes(code) || /timed? ?out|getaddrinfo/i.test(text)) {
    return 'The server could not reach the mail server. Check the host name and port. Some hosting plans block outgoing mail on ports 25, 465 and 587 (try port 2525 if your provider offers it, or use a paid instance).';
  }
  if (/self[- ]signed|certificate|CERT_/i.test(text + code)) {
    return 'The mail server presented a certificate that could not be verified. Check the host name matches the provider\'s certificate.';
  }
  if ([550, 553, 554].includes(reply) || /sender|from address|not allowed to send|unverified|not verified/i.test(text)) {
    return 'The provider refused the sender address. MAIL_FROM must be an address (or domain) you have verified with the provider.';
  }
  return text.slice(0, 300) || 'Unknown mail error.';
};

// ---- Brevo web API ----------------------------------------------------------------------------
const BREVO_API = 'https://api.brevo.com/v3';

/** "FlexHub <hi@example.com>" -> { name: 'FlexHub', email: 'hi@example.com' }; a bare address works too. */
const parseFrom = (from) => {
  const m = String(from || '').match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { ...(m[1].trim() ? { name: m[1].trim() } : {}), email: m[2].trim() } : { email: String(from || '').trim() };
};

const brevoFetch = async (path, init = {}) => {
  let res;
  try {
    res = await fetch(`${BREVO_API}${path}`, {
      ...init,
      headers: { 'api-key': String(process.env.BREVO_API_KEY).trim(), accept: 'application/json', 'content-type': 'application/json' },
      signal: AbortSignal.timeout(timeouts().connectionTimeout + 2000),
    });
  } catch (cause) {
    const err = new Error(cause?.name === 'TimeoutError' ? 'Connection timeout' : String(cause?.cause?.message || cause?.message || 'fetch failed'));
    err.code = cause?.name === 'TimeoutError' ? 'ETIMEDOUT' : 'ECONNECT';
    err.api = true;
    throw err;
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(String(body.message || `Brevo answered ${res.status}`));
    err.code = res.status === 401 ? 'EAPIAUTH' : 'EAPI';
    err.responseCode = res.status;
    err.api = true;
    throw err;
  }
  return res;
};

const sendViaBrevoApi = ({ from, to, subject, text, html }) => brevoFetch('/smtp/email', {
  method: 'POST',
  body: JSON.stringify({ sender: parseFrom(from), to: [{ email: to }], subject, htmlContent: html, textContent: text }),
});

// What the last failed send said, so an admin can see it without digging through server logs.
let lastFailure = null;

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
    if (apiConfigured()) await sendViaBrevoApi({ from, to, subject, text, html });
    else await getTransport().sendMail({ from, to, subject, text, html });
    lastFailure = null;
    return true;
  } catch (err) {
    console.error(`Email send failed: ${err.code || ''} ${err.message}`.trim());
    lastFailure = { at: new Date(), code: err.code || null, message: String(err.message || '').slice(0, 300), hint: describeMailError(err) };
    return false;
  }
};

/** What the server is set up to send with. Never includes a password. */
const mailStatus = () => {
  const out = { configured: configured(), via: null, host: null, port: null, secure: null, from: process.env.MAIL_FROM || null, urlProblem: null, keyProblem: null, lastFailure };
  if (apiConfigured()) {
    out.via = 'BREVO_API_KEY';
    out.host = 'api.brevo.com';
    out.port = 443;
    out.secure = true;
    if (/^xsmtpsib-/i.test(String(process.env.BREVO_API_KEY).trim())) {
      out.keyProblem = 'That is an SMTP key (it starts with xsmtpsib-). The API needs an API key, which starts with xkeysib-: create one under SMTP & API > API Keys in Brevo.';
    }
  } else if (process.env.SMTP_URL) {
    out.via = 'SMTP_URL';
    try {
      const u = new URL(process.env.SMTP_URL);
      out.host = u.hostname;
      out.port = Number(u.port) || (u.protocol === 'smtps:' ? 465 : 587);
      out.secure = u.protocol === 'smtps:';
    } catch {
      out.urlProblem = 'SMTP_URL is not a valid address. If the password contains @ # / ? or similar, those characters must be percent-encoded (@ becomes %40).';
    }
  } else if (process.env.SMTP_HOST) {
    out.via = 'SMTP_HOST';
    out.host = process.env.SMTP_HOST;
    out.port = Number(process.env.SMTP_PORT) || 587;
    out.secure = String(process.env.SMTP_SECURE).toLowerCase() === 'true';
  }
  return out;
};

/** Connects to the mail server (and logs in) without sending anything. */
const verifyMail = async () => {
  if (!configured()) return { ok: false, hint: 'No mail settings found. Set BREVO_API_KEY (or SMTP_URL / SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS) and MAIL_FROM, then redeploy.' };
  try {
    if (apiConfigured()) await brevoFetch('/account'); // a read-only call that proves the key is accepted
    else await getTransport().verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, code: err.code || null, message: String(err.message || '').slice(0, 300), hint: describeMailError(err) };
  }
};

// Tests only: the transport is built once from the environment, so a test that changes the
// environment must be able to rebuild it.
const resetTransport = () => { transport = undefined; lastFailure = null; };

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

module.exports = { sendMail, templated, configured, outbox, escapeHtml, describeMailError, mailStatus, verifyMail, resetTransport };
