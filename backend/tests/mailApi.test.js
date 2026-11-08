const nodemailer = require('nodemailer');
const { app, request, connect, disconnect, createSuperAdmin, auth, uniq } = require('./helpers');
const User = require('../models/User');
const mailer = require('../utils/mailer');

// Sending through Brevo's web API (BREVO_API_KEY): one key over ordinary HTTPS, so it works on hosts
// that block the SMTP ports.

const ENV_KEYS = ['BREVO_API_KEY', 'SMTP_URL', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_SECURE', 'MAIL_FROM', 'MAIL_TIMEOUT_SECONDS'];
const saved = {};
const useEnv = (env) => { ENV_KEYS.forEach((k) => delete process.env[k]); Object.assign(process.env, env); mailer.resetTransport(); };

const okResponse = (body = {}) => ({ ok: true, status: 201, json: async () => body });
const failResponse = (status, message) => ({ ok: false, status, json: async () => ({ code: 'x', message }) });
const mockFetch = (response) => jest.spyOn(global, 'fetch').mockResolvedValue(response);
const send = () => mailer.sendMail({ to: 'owner@example.com', subject: 'Hello', text: 'plain', html: '<p>rich</p>' });
const signupBody = (id) => ({ gymName: `Api ${id} Fitness`, ownerName: 'Asha Owner', email: `owner-${id}@example.com`, phone: '9800001111', password: 'Orchid-Lantern-47!' });

let sa;
beforeAll(async () => {
  await connect();
  ENV_KEYS.forEach((k) => { saved[k] = process.env[k]; });
  sa = await createSuperAdmin();
}, 90000);
afterEach(() => { useEnv({}); jest.restoreAllMocks(); });
afterAll(async () => {
  ENV_KEYS.forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; });
  mailer.resetTransport();
  await disconnect();
});

describe('sending through the Brevo web API', () => {
  it('sends one request with the key, the sender, the recipient and both bodies', async () => {
    const fetchSpy = mockFetch(okResponse({ messageId: '<1@x>' }));
    useEnv({ BREVO_API_KEY: '  xkeysib-abc123  ', MAIL_FROM: 'FlexHub <hello@example.com>' });
    expect(await send()).toBe(true);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init.method).toBe('POST');
    expect(init.headers['api-key']).toBe('xkeysib-abc123'); // surrounding spaces trimmed
    expect(JSON.parse(init.body)).toEqual({
      sender: { name: 'FlexHub', email: 'hello@example.com' },
      to: [{ email: 'owner@example.com' }],
      subject: 'Hello',
      htmlContent: '<p>rich</p>',
      textContent: 'plain',
    });
    expect(init.signal).toBeDefined(); // it cannot hang
  });

  it('understands a bare sender address as well as "Name <address>"', async () => {
    const fetchSpy = mockFetch(okResponse());
    useEnv({ BREVO_API_KEY: 'xkeysib-abc', MAIL_FROM: 'hello@example.com' });
    await send();
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body).sender).toEqual({ email: 'hello@example.com' });
  });

  it('is used in preference to SMTP when both are set, and the SMTP library is never touched', async () => {
    mockFetch(okResponse());
    const create = jest.spyOn(nodemailer, 'createTransport');
    useEnv({ BREVO_API_KEY: 'xkeysib-abc', SMTP_HOST: 'smtp.example.com', MAIL_FROM: 'a@example.com' });
    expect(mailer.mailStatus()).toMatchObject({ via: 'BREVO_API_KEY', host: 'api.brevo.com', port: 443, secure: true });
    expect(await send()).toBe(true);
    expect(create).not.toHaveBeenCalled();
  });

  it('never reveals the key, and warns when an SMTP key was pasted by mistake', () => {
    useEnv({ BREVO_API_KEY: 'xkeysib-supersecretvalue', MAIL_FROM: 'a@example.com' });
    expect(JSON.stringify(mailer.mailStatus())).not.toMatch(/supersecretvalue/);
    expect(mailer.mailStatus().keyProblem).toBeNull();
    useEnv({ BREVO_API_KEY: 'xsmtpsib-abcdef', MAIL_FROM: 'a@example.com' });
    expect(mailer.mailStatus().keyProblem).toMatch(/SMTP key.*xkeysib-/s);
    useEnv({ BREVO_API_KEY: '   ', MAIL_FROM: 'a@example.com' });
    expect(mailer.mailStatus().configured).toBe(false); // a blank key is not a key
  });

  it('explains each way Brevo can say no', async () => {
    useEnv({ BREVO_API_KEY: 'xkeysib-abc', MAIL_FROM: 'a@example.com' });
    const cases = [
      [failResponse(401, 'Key not found'), /rejected the API key.*xkeysib-/s],
      [failResponse(401, 'We have detected you are using an unrecognised IP address 1.2.3.4'), /Authorised IPs/],
      [failResponse(400, 'Sender is invalid / not validated'), /sender.*verified/is],
      [failResponse(403, 'Your account is not yet activated'), /still be under review/],
      [failResponse(500, 'Server exploded'), /Server exploded/],
    ];
    for (const [response, expected] of cases) {
      mockFetch(response);
      expect(await send()).toBe(false);
      expect(mailer.mailStatus().lastFailure.hint).toMatch(expected);
      jest.restoreAllMocks();
    }
  });

  it('explains a network failure and a timeout', async () => {
    useEnv({ BREVO_API_KEY: 'xkeysib-abc', MAIL_FROM: 'a@example.com' });
    jest.spyOn(global, 'fetch').mockRejectedValue(Object.assign(new TypeError('fetch failed'), { cause: new Error('getaddrinfo ENOTFOUND api.brevo.com') }));
    expect(await send()).toBe(false);
    expect(mailer.mailStatus().lastFailure.hint).toMatch(/could not reach api\.brevo\.com/);
    jest.restoreAllMocks();
    jest.spyOn(global, 'fetch').mockRejectedValue(Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' }));
    expect(await send()).toBe(false);
    expect(mailer.mailStatus().lastFailure.hint).toMatch(/did not answer in time/);
  });

  it('is checked with a read-only call, so a bad key shows up before anything is sent', async () => {
    useEnv({ BREVO_API_KEY: 'xkeysib-abc', MAIL_FROM: 'a@example.com' });
    const good = mockFetch(okResponse({ email: 'me@example.com' }));
    expect(await mailer.verifyMail()).toEqual({ ok: true });
    expect(good.mock.calls[0][0]).toBe('https://api.brevo.com/v3/account');
    jest.restoreAllMocks();
    mockFetch(failResponse(401, 'Key not found'));
    const bad = await mailer.verifyMail();
    expect(bad.ok).toBe(false);
    expect(bad.hint).toMatch(/API key/);
  });
});

describe('through the app', () => {
  it('works end to end: the super-admin check, a test email, and a sign-up confirmation', async () => {
    useEnv({ BREVO_API_KEY: 'xkeysib-abc', MAIL_FROM: 'FlexHub <hello@example.com>' });
    const fetchSpy = mockFetch(okResponse());
    const status = await request(app).get('/api/platform-settings/email-status').set(auth(sa.token));
    expect(status.body).toMatchObject({ configured: true, via: 'BREVO_API_KEY', check: { ok: true } });

    const test = await request(app).post('/api/platform-settings/test-email').set(auth(sa.token));
    expect(test.body).toEqual({ ok: true, to: sa.user.email });
    const sent = fetchSpy.mock.calls.filter(([url]) => url.endsWith('/smtp/email'));
    expect(JSON.parse(sent[0][1].body).to).toEqual([{ email: sa.user.email }]);

    const id = uniq('api').toLowerCase();
    const reg = await request(app).post('/api/public/signup').send(signupBody(id));
    expect(reg.status).toBe(201);
    const mails = fetchSpy.mock.calls.map(([, init]) => init && init.body).filter(Boolean).map((b) => JSON.parse(b));
    const confirmation = mails.find((m) => m.to[0].email === `owner-${id}@example.com`);
    expect(confirmation.subject).toMatch(/confirm/i);
    expect(confirmation.textContent).toMatch(/verify-email\?token=[0-9a-f]{64}/);
  });

  it('a rejected key makes sign-up fail cleanly, and the super-admin can see why', async () => {
    useEnv({ BREVO_API_KEY: 'xkeysib-wrong', MAIL_FROM: 'a@example.com' });
    mockFetch(failResponse(401, 'Key not found'));
    const id = uniq('rej').toLowerCase();
    const res = await request(app).post('/api/public/signup').send(signupBody(id));
    expect(res.status).toBe(503);
    expect(res.body.message).toMatch(/couldn't send your confirmation email/);
    expect(await User.exists({ email: `owner-${id}@example.com` })).toBeNull();
    expect(mailer.mailStatus().lastFailure.hint).toMatch(/API key/);
  });
});

describe('a scoped Brevo key', () => {
  it('is not called broken when only the account lookup is refused', async () => {
    useEnv({ BREVO_API_KEY: 'xkeysib-abc', MAIL_FROM: 'a@example.com' });
    mockFetch(failResponse(403, 'api key is not authorized for resource "account"'));
    const r = await mailer.verifyMail();
    expect(r.ok).toBe(true);
    expect(r.note).toMatch(/test email/);
  });
});
