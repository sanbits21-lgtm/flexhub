const nodemailer = require('nodemailer');
const { app, request, connect, disconnect, createSuperAdmin, auth, uniq, login, PASSWORD } = require('./helpers');
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const mailer = require('../utils/mailer');

const net = require('net');
const ENV_KEYS = ['SMTP_URL', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_SECURE', 'MAIL_FROM', 'MAIL_TIMEOUT_SECONDS'];
const saved = {};
const useEnv = (env) => { ENV_KEYS.forEach((k) => delete process.env[k]); Object.assign(process.env, env); mailer.resetTransport(); };

let sa; let pa;
beforeAll(async () => {
  await connect();
  ENV_KEYS.forEach((k) => { saved[k] = process.env[k]; });
  sa = await createSuperAdmin();
  const user = await User.create({ name: 'PA', email: `pa-${uniq('pa')}@example.com`, phone: '9000000009', password: PASSWORD, role: 'platform-admin' });
  pa = { user, token: await login(user.email) };
}, 90000);
afterEach(() => { useEnv({}); jest.restoreAllMocks(); });
afterAll(async () => { ENV_KEYS.forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }); mailer.resetTransport(); await disconnect(); });

describe('turning a mail failure into what to do about it', () => {
  const hint = (e) => mailer.describeMailError(e);

  it('recognises the usual causes', () => {
    expect(hint({ code: 'EAUTH', message: 'Invalid login: 535' })).toMatch(/username or password.*percent-encoded/s);
    expect(hint({ responseCode: 535, message: 'x' })).toMatch(/username or password/);
    expect(hint({ code: 'ETIMEDOUT', message: 'Connection timeout' })).toMatch(/could not reach.*block outgoing mail/s);
    expect(hint({ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED' })).toMatch(/could not reach/);
    expect(hint({ code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND smtp.nope' })).toMatch(/host name and port/);
    expect(hint({ code: 'ESOCKET', message: 'Greeting never received' })).toMatch(/port and the security setting.*465.*587/s);
    expect(hint({ message: 'self-signed certificate' })).toMatch(/certificate/);
    expect(hint({ responseCode: 553, message: 'Sender address rejected' })).toMatch(/MAIL_FROM/);
  });

  it('falls back to the raw message, shortened', () => {
    expect(hint({ message: 'Something odd' })).toBe('Something odd');
    expect(hint({ message: 'x'.repeat(900) })).toHaveLength(300);
    expect(hint({})).toMatch(/Unknown/);
  });
});

describe('what the server says it is set up to send with', () => {
  it('says plainly when nothing is configured', () => {
    useEnv({});
    expect(mailer.mailStatus()).toMatchObject({ configured: false, via: null, host: null });
  });

  it('reads host, port and security from SMTP_URL and never exposes the password', () => {
    useEnv({ SMTP_URL: 'smtps://apikey:s3cretPassw0rd@smtp.example.com:465', MAIL_FROM: 'FitzyClub <hi@example.com>' });
    const status = mailer.mailStatus();
    expect(status).toMatchObject({ configured: true, via: 'SMTP_URL', host: 'smtp.example.com', port: 465, secure: true, from: 'FitzyClub <hi@example.com>' });
    expect(JSON.stringify(status)).not.toMatch(/s3cretPassw0rd|apikey/);
  });

  it('defaults the port from the scheme, and reads the separate settings form too', () => {
    useEnv({ SMTP_URL: 'smtp://u:p@mail.example.com' });
    expect(mailer.mailStatus()).toMatchObject({ port: 587, secure: false });
    useEnv({ SMTP_HOST: 'smtp.example.com', SMTP_PORT: '2525', SMTP_USER: 'u', SMTP_PASS: 'topsecret' });
    const s = mailer.mailStatus();
    expect(s).toMatchObject({ via: 'SMTP_HOST', host: 'smtp.example.com', port: 2525, secure: false });
    expect(JSON.stringify(s)).not.toMatch(/topsecret/);
  });

  it('spots an SMTP_URL whose password has unencoded special characters', () => {
    useEnv({ SMTP_URL: 'smtp://user:pa#ss@@smtp.example.com:587' });
    const s = mailer.mailStatus();
    expect(s.configured).toBe(true);
    expect(s.urlProblem || s.host).toBeTruthy();
    useEnv({ SMTP_URL: 'not a url at all' });
    expect(mailer.mailStatus().urlProblem).toMatch(/percent-encoded/);
  });

  it('remembers why the last real send failed', async () => {
    useEnv({ SMTP_HOST: '127.0.0.1', SMTP_PORT: '1', MAIL_FROM: 'a@example.com' });
    expect(await mailer.sendMail({ to: 'x@example.com', subject: 's', text: 't' })).toBe(false);
    const failure = mailer.mailStatus().lastFailure;
    expect(['ESOCKET', 'ECONNREFUSED']).toContain(failure.code);
    expect(failure.hint).toMatch(/could not reach/);
    expect(failure.at).toBeInstanceOf(Date);
  });
});

describe('the super-admin email check', () => {
  it('is for the super-admin only', async () => {
    expect((await request(app).get('/api/platform-settings/email-status').set(auth(pa.token))).status).toBe(403);
    expect((await request(app).post('/api/platform-settings/test-email').set(auth(pa.token))).status).toBe(403);
    expect((await request(app).get('/api/platform-settings/email-status')).status).toBe(401);
  });

  it('reports an unconfigured server, and refuses to pretend a test worked', async () => {
    useEnv({});
    const status = await request(app).get('/api/platform-settings/email-status').set(auth(sa.token));
    expect(status.body).toMatchObject({ configured: false, check: null });
    const test = await request(app).post('/api/platform-settings/test-email').set(auth(sa.token));
    expect(test.body.ok).toBe(false);
    expect(test.body.hint).toMatch(/SMTP_URL/);
  });

  it('explains a server that cannot be reached', async () => {
    useEnv({ SMTP_HOST: '127.0.0.1', SMTP_PORT: '1', MAIL_FROM: 'a@example.com' });
    const status = await request(app).get('/api/platform-settings/email-status').set(auth(sa.token));
    expect(status.body.configured).toBe(true);
    expect(status.body.check.ok).toBe(false);
    expect(status.body.check.hint).toMatch(/could not reach/);
    const test = await request(app).post('/api/platform-settings/test-email').set(auth(sa.token));
    expect(test.body).toMatchObject({ ok: false, to: sa.user.email });
    expect(test.body.hint).toMatch(/could not reach/);
  });

  it('sends a real test message to the super-admin when the server works', async () => {
    const sendMail = jest.fn().mockResolvedValue({});
    jest.spyOn(nodemailer, 'createTransport').mockReturnValue({ verify: jest.fn().mockResolvedValue(true), sendMail });
    useEnv({ SMTP_HOST: 'smtp.example.com', MAIL_FROM: 'FitzyClub <hi@example.com>' });
    const status = await request(app).get('/api/platform-settings/email-status').set(auth(sa.token));
    expect(status.body.check).toEqual({ ok: true });
    const test = await request(app).post('/api/platform-settings/test-email').set(auth(sa.token));
    expect(test.body).toEqual({ ok: true, to: sa.user.email });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: sa.user.email, subject: 'FitzyClub test email' }));
  });
});

describe('registering while email is broken', () => {
  it('tells the visitor to try again and leaves nothing half-made', async () => {
    useEnv({ SMTP_HOST: '127.0.0.1', SMTP_PORT: '1', MAIL_FROM: 'a@example.com' });
    const id = uniq('mail').toLowerCase();
    const body = { gymName: `Mail ${id} Fitness`, ownerName: 'Asha Owner', email: `owner-${id}@example.com`, phone: '9800001111', password: 'Orchid-Lantern-47!' };
    const tenants = await Tenant.countDocuments();
    const res = await request(app).post('/api/public/signup').send(body);
    expect(res.status).toBe(503);
    expect(res.body.message).toMatch(/couldn't send your confirmation email/);
    expect(await Tenant.countDocuments()).toBe(tenants);
    expect(await User.exists({ email: body.email })).toBeNull();
    // ...and the super-admin can see why.
    expect(mailer.mailStatus().lastFailure.hint).toMatch(/could not reach/);
  });
});

describe('a mail server that never answers', () => {
  it('gives up within seconds instead of leaving the page hanging for minutes', async () => {
    // Accepts the connection and then says nothing, like a firewall that swallows the conversation.
    const silent = net.createServer(() => {});
    await new Promise((resolve) => silent.listen(0, '127.0.0.1', resolve));
    useEnv({ SMTP_HOST: '127.0.0.1', SMTP_PORT: String(silent.address().port), MAIL_TIMEOUT_SECONDS: '1', MAIL_FROM: 'a@example.com' });
    const started = Date.now();
    const check = await mailer.verifyMail();
    const took = Date.now() - started;
    silent.close();
    expect(check.ok).toBe(false);
    expect(took).toBeLessThan(6000);
    expect(check.hint).toMatch(/port and the security setting/);
  });

  it('shows up as a clear error on the sign-up page, quickly, and leaves nothing behind', async () => {
    const silent = net.createServer(() => {});
    await new Promise((resolve) => silent.listen(0, '127.0.0.1', resolve));
    useEnv({ SMTP_HOST: '127.0.0.1', SMTP_PORT: String(silent.address().port), MAIL_TIMEOUT_SECONDS: '1', MAIL_FROM: 'a@example.com' });
    const id = uniq('hang').toLowerCase();
    const started = Date.now();
    const res = await request(app).post('/api/public/signup').send({ gymName: `Hang ${id} Fitness`, ownerName: 'Asha Owner', email: `owner-${id}@example.com`, phone: '9800001111', password: 'Orchid-Lantern-47!' });
    silent.close();
    expect(res.status).toBe(503);
    expect(Date.now() - started).toBeLessThan(8000);
    expect(await User.exists({ email: `owner-${id}@example.com` })).toBeNull();
  });

  it('is given short timeouts for both ways of configuring email (default 10 seconds)', async () => {
    const create = jest.spyOn(nodemailer, 'createTransport').mockReturnValue({ verify: jest.fn().mockResolvedValue(true) });
    useEnv({ SMTP_URL: 'smtp://u:p@smtp.example.com:587' });
    await mailer.verifyMail();
    expect(create).toHaveBeenLastCalledWith(expect.objectContaining({ url: 'smtp://u:p@smtp.example.com:587', connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000 }));
    useEnv({ SMTP_HOST: 'smtp.example.com', MAIL_TIMEOUT_SECONDS: '3' });
    await mailer.verifyMail();
    expect(create).toHaveBeenLastCalledWith(expect.objectContaining({ host: 'smtp.example.com', connectionTimeout: 3000, greetingTimeout: 3000, socketTimeout: 6000 }));
  });
});
