const { app, request, connect, disconnect, createSuperAdmin, uniq } = require('./helpers');
const User = require('../models/User');
const mailer = require('../utils/mailer');
const alerts = require('../utils/alerts');
const { isRemoteMongoUri } = require('../utils/devGuard');

const { outbox } = mailer;
const saved = {};
beforeAll(async () => {
  await connect();
  ['ALERTS', 'ALERT_EMAIL'].forEach((k) => { saved[k] = process.env[k]; });
}, 90000);
afterAll(async () => {
  ['ALERTS', 'ALERT_EMAIL'].forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; });
  await disconnect();
});
beforeEach(() => { outbox.length = 0; alerts.reset(); process.env.ALERTS = 'on'; process.env.ALERT_EMAIL = 'ops@example.com'; });
afterEach(() => jest.restoreAllMocks());

const alertsSent = () => outbox.filter((m) => /server error/i.test(m.subject));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// A request that makes the server itself fail: the database lookup behind sign-in throws.
const breakLogin = (message = 'boom') => {
  jest.spyOn(User, 'findOne').mockRejectedValueOnce(new Error(message));
  return request(app).post('/api/auth/login').send({ email: 'someone@example.com', password: 'Super-Secret-Pass-9!' });
};

describe('server error alerts', () => {
  it('emails the operators when a request fails on the server, with where it happened but not what was sent', async () => {
    const res = await breakLogin('database exploded');
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/on our side/); // the visitor sees nothing technical
    await sleep(200);
    const [mail] = alertsSent();
    expect(mail.to).toBe('ops@example.com');
    expect(mail.text).toContain('POST /api/auth/login');
    expect(mail.text).toContain('database exploded');
    expect(mail.text).not.toContain('someone@example.com'); // no request contents
    expect(mail.text).not.toContain('Super-Secret-Pass-9!');
  });

  it('sends the same error once, then stays quiet', async () => {
    await breakLogin('same failure');
    await breakLogin('same failure');
    await breakLogin('same failure');
    await sleep(300);
    expect(alertsSent()).toHaveLength(1);
    await breakLogin('a different failure');
    await sleep(300);
    expect(alertsSent()).toHaveLength(2);
  });

  it('says nothing for a visitor\'s mistake', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'wrong' });
    expect(res.status).toBe(401);
    await sleep(200);
    expect(alertsSent()).toHaveLength(0);
  });

  it('is off when switched off, and limits itself to 20 an hour', async () => {
    process.env.ALERTS = 'off';
    expect(await alerts.notifyError(new Error('quiet'), 'test')).toBe(false);
    process.env.ALERTS = 'on';
    let delivered = 0;
    for (let i = 0; i < 25; i += 1) if (await alerts.notifyError(new Error(`distinct ${i}`), 'test')) delivered += 1;
    expect(delivered).toBe(20);
  });

  it('goes to the super-admins when no address is configured', async () => {
    delete process.env.ALERT_EMAIL;
    const sa = await createSuperAdmin();
    expect(await alerts.notifyError(new Error(`needs a recipient ${uniq('e')}`), 'test')).toBe(true);
    expect(outbox.some((m) => m.to === sa.user.email && /server error/i.test(m.subject))).toBe(true);
  });

  it('never throws, even when mail fails', async () => {
    jest.spyOn(mailer, 'sendMail').mockRejectedValue(new Error('smtp down'));
    await expect(alerts.notifyError(new Error('mail is broken'), 'test')).resolves.toBe(false);
  });
});

describe('readiness', () => {
  it('answers /health while up and /readyz only while the database answers', async () => {
    expect((await request(app).get('/health')).body.status).toBe('ok');
    const ready = await request(app).get('/readyz');
    expect(ready.status).toBe(200);
    expect(ready.body).toMatchObject({ status: 'ok', database: 'ok' });
  });
});

describe('the local-database warning', () => {
  it('flags hosted databases and accepts this machine and the project\'s own docker one', () => {
    expect(isRemoteMongoUri('mongodb+srv://u:p@cluster0.abcde.mongodb.net/flexhub')).toBe(true);
    expect(isRemoteMongoUri('mongodb://u:p@shard-00-00.abcde.mongodb.net:27017,shard-00-01.abcde.mongodb.net:27017/flexhub?ssl=true')).toBe(true);
    expect(isRemoteMongoUri('mongodb://db.example.com:27017/flexhub')).toBe(true);
    expect(isRemoteMongoUri('mongodb://localhost:27017/flexhub')).toBe(false);
    expect(isRemoteMongoUri('mongodb://127.0.0.1:27017/flexhub')).toBe(false);
    expect(isRemoteMongoUri('mongodb://mongo:27017/flexhub')).toBe(false);
    expect(isRemoteMongoUri('mongodb://user:pass@localhost:27017/flexhub')).toBe(false);
    expect(isRemoteMongoUri('')).toBe(false);
    expect(isRemoteMongoUri(undefined)).toBe(false);
  });
});
