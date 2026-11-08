const bcrypt = require('bcryptjs');
const { app, request, connect, disconnect, seedTenant, createMember, auth, uniq, PASSWORD } = require('./helpers');
const LoginAttempt = require('../models/LoginAttempt');
const Tenant = require('../models/Tenant');

const staff = (email, password = 'wrong-password', headers = {}) => request(app).post('/api/auth/login').set(headers).send({ email, password });
const member = (identifier, password = 'wrong-password', headers = {}) => request(app).post('/api/member-auth/login').set(headers).send({ identifier, password });
const wrongTimes = async (fn, n) => { const codes = []; for (let i = 0; i < n; i += 1) codes.push((await fn()).status); return codes; };
const keyOf = (kind, id, scope = '') => `${kind}:${scope}:${id.toLowerCase()}`;

let t;
beforeAll(async () => { await connect(); t = await seedTenant('lock'); }, 90000);
afterAll(async () => { delete process.env.BASE_DOMAIN; await LoginAttempt.deleteMany({}); await disconnect(); });
beforeEach(async () => { await LoginAttempt.deleteMany({}); });

describe('staff sign-in lockout', () => {
  it('locks an account after five wrong passwords, with a clear message and Retry-After', async () => {
    const codes = await wrongTimes(() => staff(t.admin.email), 5);
    expect(codes).toEqual([401, 401, 401, 401, 401]);
    const locked = await staff(t.admin.email);
    expect(locked.status).toBe(429);
    expect(locked.body).toMatchObject({ code: 'LOGIN_LOCKED' });
    expect(locked.body.message).toMatch(/try again in 15 minutes/i);
    expect(locked.body.retryAfterSeconds).toBeGreaterThan(14 * 60);
    expect(Number(locked.headers['retry-after'])).toBe(locked.body.retryAfterSeconds);
  });

  it('refuses even the right password while locked, so a guesser cannot learn it worked', async () => {
    await wrongTimes(() => staff(t.admin.email), 5);
    expect((await staff(t.admin.email, PASSWORD)).status).toBe(429);
  });

  it('lets the owner in once the lock has run out, and wipes the record', async () => {
    await wrongTimes(() => staff(t.admin.email), 5);
    await LoginAttempt.updateOne({ key: keyOf('user', t.admin.email) }, { lockedUntil: new Date(Date.now() - 1000) });
    expect((await staff(t.admin.email, PASSWORD)).status).toBe(200);
    expect(await LoginAttempt.countDocuments({ key: keyOf('user', t.admin.email) })).toBe(0);
  });

  it('a correct sign-in resets the count, so a few typos over time never lock anyone', async () => {
    await wrongTimes(() => staff(t.admin.email), 4);
    expect((await staff(t.admin.email, PASSWORD)).status).toBe(200);
    expect(await wrongTimes(() => staff(t.admin.email), 4)).toEqual([401, 401, 401, 401]);
    expect((await staff(t.admin.email, PASSWORD)).status).toBe(200);
  });

  it('forgets failures that are older than the window', async () => {
    await wrongTimes(() => staff(t.admin.email), 4);
    await LoginAttempt.updateOne({ key: keyOf('user', t.admin.email) }, { windowStart: new Date(Date.now() - 20 * 60000) });
    expect(await wrongTimes(() => staff(t.admin.email), 4)).toEqual([401, 401, 401, 401]); // would have been the 5th-8th
    expect((await staff(t.admin.email, PASSWORD)).status).toBe(200);
  });

  it('treats the email case-insensitively', async () => {
    await wrongTimes(() => staff(t.admin.email.toUpperCase()), 3);
    await wrongTimes(() => staff(t.admin.email), 2);
    expect((await staff(t.admin.email, PASSWORD)).status).toBe(429);
  });

  it("does not touch anyone else's account", async () => {
    await wrongTimes(() => staff(t.admin.email), 5);
    expect((await staff(t.admin.email)).status).toBe(429);
    expect((await staff(t.manager.email, PASSWORD)).status).toBe(200);
  });

  it('locks longer each time, up to four times as long', async () => {
    const key = keyOf('user', t.admin.email);
    const lockLength = async () => {
      await wrongTimes(() => staff(t.admin.email), 5);
      const doc = await LoginAttempt.findOne({ key });
      const secs = Math.round((doc.lockedUntil - Date.now()) / 1000);
      await LoginAttempt.updateOne({ key }, { lockedUntil: new Date(Date.now() - 1000) }); // let it expire, keep the history
      return secs;
    };
    const first = await lockLength();
    const second = await lockLength();
    const third = await lockLength();
    const fourth = await lockLength();
    expect(first).toBeGreaterThan(14 * 60); expect(first).toBeLessThanOrEqual(15 * 60);
    expect(second).toBeGreaterThan(29 * 60); expect(second).toBeLessThanOrEqual(30 * 60);
    expect(third).toBeGreaterThan(59 * 60); expect(third).toBeLessThanOrEqual(60 * 60);
    expect(fourth).toBeLessThanOrEqual(60 * 60); // capped
  });

  it('parallel guesses lock once, not once each', async () => {
    await Promise.all(Array.from({ length: 12 }, () => staff(t.admin.email)));
    const doc = await LoginAttempt.findOne({ key: keyOf('user', t.admin.email) });
    expect(doc.lockedUntil.getTime()).toBeGreaterThan(Date.now());
    expect(doc.lockCount).toBe(1);
  });
});

describe('a lock reveals nothing about who has an account', () => {
  it('an email that does not exist locks and answers exactly like one that does', async () => {
    const ghost = `nobody-${uniq('g')}@example.com`;
    await wrongTimes(() => staff(ghost), 5);
    await wrongTimes(() => staff(t.admin.email), 5);
    const a = await staff(ghost);
    const b = await staff(t.admin.email);
    expect(a.status).toBe(429);
    expect(b.status).toBe(429);
    expect({ ...a.body, retryAfterSeconds: 0 }).toEqual({ ...b.body, retryAfterSeconds: 0 });
    // and before the lock, both look the same too
    await LoginAttempt.deleteMany({});
    expect((await staff(ghost)).body).toEqual((await staff(t.admin.email)).body);
  });

  it('an unknown email still pays for a password check, so it is not faster to answer', async () => {
    const spy = jest.spyOn(bcrypt, 'compare');
    await staff(`nobody-${uniq('g')}@example.com`);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockClear();
    await staff(t.admin.email); // a real account: exactly one check as well
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe('member sign-in lockout', () => {
  let access;
  beforeAll(async () => {
    const m = await createMember(t.managerToken, { branchId: t.branch._id.toString(), planId: t.plan._id.toString(), name: 'Mem', phone: '9400000021' });
    access = (await request(app).post(`/api/members/${m._id}/app-access`).set(auth(t.managerToken))).body;
  });

  it('locks a member code after five wrong passwords, and releases on a correct sign-in later', async () => {
    expect(await wrongTimes(() => member(access.memberCode), 5)).toEqual([401, 401, 401, 401, 401]);
    const locked = await member(access.memberCode, access.password);
    expect(locked.status).toBe(429);
    expect(locked.body.code).toBe('LOGIN_LOCKED');
    await LoginAttempt.updateOne({ key: keyOf('member', access.memberCode) }, { lockedUntil: new Date(Date.now() - 1000) });
    expect((await member(access.memberCode, access.password)).status).toBe(200);
  });

  it('a made-up member code locks the same way', async () => {
    await wrongTimes(() => member('GYM-NOPE12345'), 5);
    expect((await member('GYM-NOPE12345')).status).toBe(429);
  });

  it("is kept apart per gym address, so one gym's attacker cannot lock another gym's member", async () => {
    process.env.BASE_DOMAIN = 'example.test';
    const other = await seedTenant('lockb');
    const hostA = { Host: `${t.tenant.slug}.example.test` };
    const hostB = { Host: `${other.tenant.slug}.example.test` };
    await wrongTimes(() => member('same@example.com', 'x', hostA), 5);
    expect((await member('same@example.com', 'x', hostA)).status).toBe(429);
    expect((await member('same@example.com', 'x', hostB)).status).toBe(401);
    delete process.env.BASE_DOMAIN;
    await Tenant.updateOne({ _id: other.tenant._id }, { isActive: true });
  });
});
