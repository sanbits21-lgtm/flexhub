const { app, request, connect, disconnect, seedTenant, createMember, createSuperAdmin, auth, uniq, login, PASSWORD } = require('./helpers');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Branch = require('../models/Branch');
const PlatformSettings = require('../models/PlatformSettings');
const generateToken = require('../utils/generateToken');
const { outbox } = require('../utils/mailer');

let superAdmin; let platformAdmin;
const body = (over = {}) => {
  const id = uniq('reg').toLowerCase();
  return { gymName: `Iron ${id} Fitness`, ownerName: 'Asha Owner', email: `owner-${id}@example.com`, phone: '9800001111', password: 'Password123!', ...over };
};
const signup = (b, host) => { const r = request(app).post('/api/public/signup'); if (host) r.set('Host', host); return r.send(b); };
const mailsTo = (to) => outbox.filter((m) => m.to === to);
const tokenIn = (mail) => mail.text.match(/token=([0-9a-f]{64})/)[1];
const verify = (token) => request(app).post('/api/public/verify-email').send({ token });
const ownerLogin = (email) => request(app).post('/api/auth/login').send({ email, password: 'Password123!' });
const approve = (id, over = {}) => request(app).post(`/api/tenants/${id}/approve`).set(auth(superAdmin.token)).send(over);

// Registers, confirms the email and (optionally) gets approved; returns a working owner session.
const register = async (over = {}, { approveWith } = {}) => {
  const b = body(over);
  const res = await signup(b);
  expect(res.status).toBe(201);
  const user = await User.findOne({ email: b.email });
  expect((await verify(tokenIn(mailsTo(b.email)[0]))).status).toBe(200);
  const tenantId = user.tenantId.toString();
  if (approveWith) expect((await approve(tenantId, approveWith)).status).toBe(200);
  const token = approveWith ? (await ownerLogin(b.email)).body.token : null;
  return { b, user, tenantId, token };
};

beforeAll(async () => {
  await connect();
  superAdmin = await createSuperAdmin();
  const pa = await User.create({ name: 'PA', email: `pa-${uniq('pa')}@example.com`, phone: '9000000008', password: PASSWORD, role: 'platform-admin' });
  platformAdmin = { user: pa, token: await login(pa.email) };
}, 90000);
beforeEach(() => { outbox.length = 0; });
afterAll(async () => {
  await PlatformSettings.deleteMany({});
  delete process.env.BASE_DOMAIN;
  await disconnect();
});

describe('registering a gym', () => {
  it('creates a waiting gym, signs nobody in, and emails a confirmation link', async () => {
    const b = body();
    const res = await signup(b);
    expect(res.status).toBe(201);
    expect(res.body.token).toBeUndefined();
    const user = await User.findOne({ email: b.email });
    expect(user).toMatchObject({ role: 'tenant-admin', emailVerified: false });
    expect(user.emailVerifyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(user.emailVerifyHash).not.toBe(tokenIn(mailsTo(b.email)[0])); // only the hash is stored
    const tenant = await Tenant.findById(user.tenantId);
    expect(tenant).toMatchObject({ approvalStatus: 'pending', signupSource: 'self', billingPlan: 'trial' });
    expect(tenant.trialEndsAt).toBeUndefined(); // the clock starts at approval
    expect(await Branch.countDocuments({ tenantId: tenant._id })).toBe(1);
    expect(mailsTo(b.email)).toHaveLength(1);
  });

  it('cannot be used before the email is confirmed, with a clear reason', async () => {
    const b = body();
    await signup(b);
    const res = await ownerLogin(b.email);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
    expect((await request(app).post('/api/auth/login').send({ email: b.email, password: 'wrong-password' })).status).toBe(401); // wrong password reveals nothing
  });

  it('derives a clean, unreserved address from the gym name and avoids clashes', async () => {
    const a = await signup(body({ gymName: 'Admin!!' }));
    expect(a.status).toBe(201);
    const u = await User.findOne({ email: (await User.findOne({}).sort({ createdAt: -1 })).email });
    const slugA = (await Tenant.findById(u.tenantId)).slug;
    expect(slugA).toMatch(/^[a-z0-9-]{3,30}$/);
    expect(slugA).not.toBe('admin');
    const same = body({ gymName: 'Crossfit Zone' });
    await signup(same);
    await signup({ ...same, email: `two-${same.email}` });
    const slugs = (await Tenant.find({ slug: /^crossfit-zone/ })).map((t) => t.slug).sort();
    expect(slugs).toEqual(['crossfit-zone', 'crossfit-zone-2']);
  });

  it('honours a chosen address and refuses reserved, malformed or taken ones', async () => {
    expect((await signup(body({ slug: 'my-own-gym' }))).status).toBe(201);
    expect((await signup(body({ slug: 'my-own-gym' }))).status).toBe(409);
    expect((await signup(body({ slug: 'www' }))).status).toBe(400);
    expect((await signup(body({ slug: 'Bad Name' }))).status).toBe(400);
  });

  it('refuses a duplicate email and leaves nothing half-made', async () => {
    const b = body();
    expect((await signup(b)).status).toBe(201);
    const before = await Tenant.countDocuments();
    const again = await signup({ ...b, gymName: 'Another Gym Name' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('UNVERIFIED_EXISTS');
    expect(await Tenant.countDocuments()).toBe(before);
  });

  it('validates input, rejects smuggled fields, and catches bots', async () => {
    expect((await signup(body({ password: 'short' }))).status).toBe(400);
    expect((await signup(body({ email: 'not-an-email' }))).status).toBe(400);
    expect((await signup(body({ phone: 'abc' }))).status).toBe(400);
    expect((await signup(body({ billingPlan: 'enterprise', approvalStatus: 'approved', role: 'super-admin' }))).status).toBe(400);
    const bot = body();
    expect((await signup({ ...bot, website: 'http://spam.example' })).status).toBe(400);
    expect(await User.exists({ email: bot.email })).toBeNull();
  });

  it('is unavailable on a gym or unknown address', async () => {
    process.env.BASE_DOMAIN = 'gym.test';
    const t = await seedTenant('sgnhost');
    expect((await signup(body(), `${t.tenant.slug}.gym.test`)).status).toBe(404);
    expect((await signup(body(), 'nobody-here.gym.test')).status).toBe(404);
    delete process.env.BASE_DOMAIN;
  });
});

describe('confirming the email', () => {
  it('rejects a bad token, accepts a good one (twice is fine), and tells platform staff', async () => {
    const b = body();
    await signup(b);
    const token = tokenIn(mailsTo(b.email)[0]);
    expect((await verify('0'.repeat(64))).status).toBe(400);
    expect((await request(app).post('/api/public/verify-email').send({ token: 'short' })).status).toBe(400);
    const ok = await verify(token);
    expect(ok.body).toMatchObject({ verified: true, approvalStatus: 'pending' });
    expect((await verify(token)).body).toMatchObject({ verified: true, already: true });
    await new Promise((r) => setTimeout(r, 100));
    expect(outbox.some((m) => m.to === superAdmin.user.email && /awaiting approval/i.test(m.subject))).toBe(true);
  });

  it('expires after a day', async () => {
    const b = body();
    await signup(b);
    await User.updateOne({ email: b.email }, { emailVerifyExpires: new Date(Date.now() - 1000) });
    const res = await verify(tokenIn(mailsTo(b.email)[0]));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('LINK_INVALID');
  });

  it('can be re-sent: same answer for anyone, throttled, and the old link stops working', async () => {
    const b = body();
    await signup(b);
    const resend = (email) => request(app).post('/api/public/resend-verification').send({ email });
    const unknown = await resend('nobody@example.com');
    const known = await resend(b.email);
    expect(unknown.body).toEqual(known.body); // cannot be used to discover who registered
    expect(mailsTo(b.email)).toHaveLength(1); // too soon after signup: throttled
    await User.updateOne({ email: b.email }, { emailVerifySentAt: new Date(Date.now() - 120000) });
    await resend(b.email);
    expect(mailsTo(b.email)).toHaveLength(2);
    expect((await verify(tokenIn(mailsTo(b.email)[0]))).status).toBe(400);
    expect((await verify(tokenIn(mailsTo(b.email)[1]))).status).toBe(200);
  });
});

describe('approval by platform staff', () => {
  it('keeps a confirmed gym out until approved', async () => {
    const { b, user } = await register();
    const res = await ownerLogin(b.email);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PENDING_APPROVAL');
    // even a token that somehow exists is useless
    const stray = generateToken(user._id, 'user');
    const blocked = await request(app).get('/api/branches').set(auth(stray));
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('PENDING_APPROVAL');
  });

  it('cannot approve a gym whose owner has not confirmed their email', async () => {
    const b = body();
    await signup(b);
    const { tenantId } = { tenantId: (await User.findOne({ email: b.email })).tenantId.toString() };
    expect((await approve(tenantId)).status).toBe(400);
  });

  it('shows pending gyms (with email status) to platform staff', async () => {
    const b = body();
    await signup(b);
    const list = await request(app).get('/api/tenants').set(auth(platformAdmin.token));
    const row = list.body.find((t) => t.contactEmail === b.email);
    expect(row).toMatchObject({ approvalStatus: 'pending', owner: { email: b.email, emailVerified: false } });
  });

  it('approves with the current terms, starts the trial then, emails the owner, and opens the gym', async () => {
    const { b, tenantId } = await register();
    const res = await approve(tenantId);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ approvalStatus: 'approved', maxBranches: 1, maxMembers: 50 });
    const days = (new Date(res.body.trialEndsAt) - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThanOrEqual(14);
    expect(mailsTo(b.email).some((m) => /approved/i.test(m.subject))).toBe(true);

    const session = await ownerLogin(b.email);
    expect(session.status).toBe(200);
    expect(session.body.subscription).toMatchObject({ onTrial: true, trialExpired: false, daysLeft: 14 });
    expect((await approve(tenantId)).status).toBe(409);
  });

  it('lets the approver set the trial for this gym', async () => {
    const { tenantId } = await register({}, { approveWith: { trialDays: 30, maxMembers: 10, maxBranches: 2 } });
    const t = await Tenant.findById(tenantId);
    expect(t).toMatchObject({ maxMembers: 10, maxBranches: 2 });
    expect(Math.round((t.trialEndsAt - Date.now()) / 86400000)).toBe(30);
    const bad = await register();
    expect((await approve(bad.tenantId, { trialDays: 0 })).status).toBe(400);
    expect((await approve(bad.tenantId, { trialDays: 'abc' })).status).toBe(400);
  });

  it('can reject (the owner is told and stays out) and reconsider later', async () => {
    const { b, tenantId } = await register();
    const rej = await request(app).post(`/api/tenants/${tenantId}/reject`).set(auth(platformAdmin.token)).send({ reason: 'Not a real gym' });
    expect(rej.status).toBe(200);
    expect(mailsTo(b.email).some((m) => /could not approve/i.test(m.text) && /Not a real gym/.test(m.text))).toBe(true);
    const res = await ownerLogin(b.email);
    expect(res.body.code).toBe('REJECTED');
    expect((await approve(tenantId)).status).toBe(200);
    expect((await ownerLogin(b.email)).status).toBe(200);
  });

  it('is for platform staff only', async () => {
    const { tenantId } = await register();
    const t = await seedTenant('notstaff');
    expect((await request(app).post(`/api/tenants/${tenantId}/approve`).set(auth(t.adminToken))).status).toBe(403);
  });
});

describe('trial terms are a setting', () => {
  const put = (token, data) => request(app).put('/api/platform-settings').set(auth(token)).send(data);

  it('starts from the defaults and can be read by platform staff', async () => {
    const res = await request(app).get('/api/platform-settings').set(auth(platformAdmin.token));
    expect(res.body).toEqual({ selfSignupEnabled: true, trialDays: 14, trialMaxMembers: 50, trialMaxBranches: 1 });
  });

  it('is changed by the super-admin only, with validation', async () => {
    expect((await put(platformAdmin.token, { trialDays: 5 })).status).toBe(403);
    expect((await put(superAdmin.token, { trialDays: 0 })).status).toBe(400);
    expect((await put(superAdmin.token, { trialDays: 400 })).status).toBe(400);
    expect((await put(superAdmin.token, { trialMaxMembers: 'lots' })).status).toBe(400);
    const ok = await put(superAdmin.token, { trialDays: 21, trialMaxMembers: 100, trialMaxBranches: 2 });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ trialDays: 21, trialMaxMembers: 100, trialMaxBranches: 2 });
  });

  it('applies to the next approval, and shows on the signup page', async () => {
    await put(superAdmin.token, { trialDays: 21, trialMaxMembers: 100, trialMaxBranches: 2 });
    const cfg = await request(app).get('/api/public/signup-config');
    expect(cfg.body).toMatchObject({ enabled: true, trialDays: 21, maxMembers: 100 });
    const { b, tenantId } = await register();
    expect((await approve(tenantId)).body).toMatchObject({ maxMembers: 100, maxBranches: 2 });
    const me = await ownerLogin(b.email);
    expect(me.body.subscription.daysLeft).toBe(21);
    await put(superAdmin.token, { trialDays: 14, trialMaxMembers: 50, trialMaxBranches: 1 });
  });

  it('can close self-registration', async () => {
    await put(superAdmin.token, { selfSignupEnabled: false });
    expect((await request(app).get('/api/public/signup-config')).body.enabled).toBe(false);
    expect((await signup(body())).status).toBe(404);
    await put(superAdmin.token, { selfSignupEnabled: true });
    expect((await signup(body())).status).toBe(201);
  });
});

describe('trial limits after approval', () => {
  it('stops adding members at the cap, including in a bulk upload', async () => {
    const { token, tenantId } = await register({}, { approveWith: { maxMembers: 2 } });
    const branchId = (await Branch.findOne({ tenantId }))._id.toString();
    const add = (n) => request(app).post('/api/members').set(auth(token)).send({ name: `M${n}`, phone: `97000000${n}0`, branchId });
    expect((await add(1)).status).toBe(201);
    expect((await add(2)).status).toBe(201);
    const third = await add(3);
    expect(third.status).toBe(402);
    expect(third.body.code).toBe('MEMBER_LIMIT');
    expect((await request(app).post('/api/members/bulk').set(auth(token)).send({ branchId, members: [{ name: 'X', phone: '9700000099' }] })).status).toBe(402);
  });

  it('after the trial ends: can read everything, cannot change anything, can still sign in', async () => {
    const { b, token, tenantId } = await register({}, { approveWith: {} });
    await Tenant.updateOne({ _id: tenantId }, { trialEndsAt: new Date(Date.now() - 1000) });
    expect((await request(app).get('/api/branches').set(auth(token))).status).toBe(200);
    const write = await request(app).post('/api/branches').set(auth(token)).send({ name: 'Second' });
    expect(write.status).toBe(402);
    expect(write.body.code).toBe('TRIAL_ENDED');
    expect((await request(app).get('/api/auth/me').set(auth(token))).body.subscription).toMatchObject({ trialExpired: true, daysLeft: 0 });
    expect((await ownerLogin(b.email)).status).toBe(200);
  });

  it('lets platform staff extend the trial or convert the gym to a paid plan, which lifts the limits', async () => {
    const { token, tenantId } = await register({}, { approveWith: {} });
    await Tenant.updateOne({ _id: tenantId }, { trialEndsAt: new Date(Date.now() - 1000) });
    const extend = await request(app).put(`/api/tenants/${tenantId}`).set(auth(superAdmin.token)).send({ trialEndsAt: new Date(Date.now() + 7 * 86400000).toISOString() });
    expect(extend.status).toBe(200);
    expect((await request(app).post('/api/branches').set(auth(token)).send({ name: 'Second' })).status).not.toBe(402);
    const paid = await request(app).put(`/api/tenants/${tenantId}`).set(auth(superAdmin.token)).send({ billingPlan: 'pro', maxBranches: 5 });
    expect(paid.body).toMatchObject({ billingPlan: 'pro', trialEndsAt: null, maxMembers: null });
  });

  it('never expires, and never waits for approval, gyms created by platform staff', async () => {
    const t = await seedTenant('legacy');
    expect((await request(app).post('/api/branches').set(auth(t.adminToken)).send({ name: 'Another' })).status).not.toBe(402);
    const me = await request(app).get('/api/auth/me').set(auth(t.adminToken));
    expect(me.body.subscription).toMatchObject({ onTrial: false, trialExpired: false });
    expect((await Tenant.findById(t.tenant._id)).approvalStatus).toBe('approved');
  });

  it("does not lock a gym's members out when only the trial ends, but does when the gym is suspended", async () => {
    const t = await seedTenant('memlock');
    const m = await createMember(t.managerToken, { branchId: t.branch._id.toString(), planId: t.plan._id.toString(), name: 'Mem', phone: '9400000001' });
    const access = await request(app).post(`/api/members/${m._id}/app-access`).set(auth(t.managerToken));
    const loginRes = await request(app).post('/api/member-auth/login').send({ identifier: access.body.memberCode, password: access.body.password });
    const token = loginRes.body.token;
    await Tenant.updateOne({ _id: t.tenant._id }, { trialEndsAt: new Date(Date.now() - 1000), billingPlan: 'trial' });
    expect((await request(app).get('/api/member-app/me').set(auth(token))).status).toBe(200);
    await Tenant.updateOne({ _id: t.tenant._id }, { billingStatus: 'suspended', isActive: false });
    const blocked = await request(app).get('/api/member-app/me').set(auth(token));
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('GYM_SUSPENDED');
    expect((await request(app).get('/api/branches').set(auth(t.adminToken))).status).toBe(403);
  });
});
