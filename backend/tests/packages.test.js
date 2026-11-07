const { app, request, connect, disconnect, createSuperAdmin, auth, uniq, login, PASSWORD } = require('./helpers');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const SubscriptionPackage = require('../models/SubscriptionPackage');
const PlatformSettings = require('../models/PlatformSettings');
const { outbox } = require('../utils/mailer');

let superAdmin; let platformAdmin;
const make = (over = {}) => ({ name: `Plan ${uniq('p')}`.slice(0, 40), description: 'For one gym', price: 999, billingMonths: 1, trialDays: 14, maxBranches: 2, maxMembers: 100, highlights: ['QR check-in'], ...over });
const createPkg = async (over = {}) => {
  const res = await request(app).post('/api/packages').set(auth(superAdmin.token)).send(make(over));
  expect(res.status).toBe(201);
  return res.body;
};
const body = (over = {}) => {
  const id = uniq('reg').toLowerCase();
  return { gymName: `Pkg ${id} Fitness`, ownerName: 'Asha Owner', email: `owner-${id}@example.com`, phone: '9800001111', password: 'Password123!', ...over };
};
const signup = (b) => request(app).post('/api/public/signup').send(b);
const config = async () => (await request(app).get('/api/public/signup-config')).body;
const tokenIn = (to) => outbox.filter((m) => m.to === to)[0].text.match(/token=([0-9a-f]{64})/)[1];
const approve = (id, over = {}) => request(app).post(`/api/tenants/${id}/approve`).set(auth(superAdmin.token)).send(over);

// Registers and confirms the email; the gym is then waiting for approval.
const register = async (over = {}) => {
  const b = body(over);
  const res = await signup(b);
  expect(res.status).toBe(201);
  expect((await request(app).post('/api/public/verify-email').send({ token: tokenIn(b.email) })).status).toBe(200);
  const user = await User.findOne({ email: b.email });
  return { b, tenantId: user.tenantId.toString() };
};

beforeAll(async () => {
  await connect();
  await SubscriptionPackage.deleteMany({});
  superAdmin = await createSuperAdmin();
  const pa = await User.create({ name: 'PA', email: `pa-${uniq('pa')}@example.com`, phone: '9000000008', password: PASSWORD, role: 'platform-admin' });
  platformAdmin = { user: pa, token: await login(pa.email) };
}, 90000);
beforeEach(async () => { outbox.length = 0; await SubscriptionPackage.deleteMany({}); });
afterAll(async () => {
  await SubscriptionPackage.deleteMany({});
  await PlatformSettings.deleteMany({});
  await disconnect();
});

describe('managing packages', () => {
  it('lets the super-admin create, edit and list packages', async () => {
    const pkg = await createPkg({ name: 'Starter', price: 499 });
    expect(pkg).toMatchObject({ name: 'Starter', price: 499, billingMonths: 1, trialDays: 14, maxBranches: 2, maxMembers: 100, isActive: true });
    const edited = await request(app).put(`/api/packages/${pkg._id}`).set(auth(superAdmin.token)).send({ price: 599, highlights: ['A', 'B'] });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ name: 'Starter', price: 599, highlights: ['A', 'B'], maxMembers: 100 });
    const list = await request(app).get('/api/packages').set(auth(superAdmin.token));
    expect(list.body).toHaveLength(1);
    expect(list.body[0].gyms).toBe(0);
  });

  it('allows any billing period, not just monthly/quarterly/yearly', async () => {
    const pkg = await createPkg({ billingMonths: 6 });
    expect(pkg.billingMonths).toBe(6);
    expect((await request(app).put(`/api/packages/${pkg._id}`).set(auth(superAdmin.token)).send({ billingMonths: 24 })).body.billingMonths).toBe(24);
    expect((await config()).packages[0].billingMonths).toBe(24);
  });

  it('treats a null member limit as unlimited', async () => {
    const pkg = await createPkg({ maxMembers: null });
    expect(pkg.maxMembers).toBeUndefined();
    const limited = await request(app).put(`/api/packages/${pkg._id}`).set(auth(superAdmin.token)).send({ maxMembers: 40 });
    expect(limited.body.maxMembers).toBe(40);
    const back = await request(app).put(`/api/packages/${pkg._id}`).set(auth(superAdmin.token)).send({ maxMembers: null });
    expect(back.body.maxMembers).toBeUndefined();
  });

  it('lets a platform admin read but not change packages', async () => {
    const pkg = await createPkg();
    expect((await request(app).get('/api/packages').set(auth(platformAdmin.token))).status).toBe(200);
    expect((await request(app).post('/api/packages').set(auth(platformAdmin.token)).send(make())).status).toBe(403);
    expect((await request(app).put(`/api/packages/${pkg._id}`).set(auth(platformAdmin.token)).send({ price: 1 })).status).toBe(403);
    expect((await request(app).delete(`/api/packages/${pkg._id}`).set(auth(platformAdmin.token))).status).toBe(403);
    expect((await request(app).get('/api/packages')).status).toBe(401);
  });

  it('rejects nonsense', async () => {
    const put = (b) => request(app).post('/api/packages').set(auth(superAdmin.token)).send(b);
    expect((await put(make({ price: -5 }))).status).toBe(400);
    expect((await put(make({ maxBranches: 0 }))).status).toBe(400);
    expect((await put(make({ trialDays: 400 }))).status).toBe(400);
    expect((await put(make({ billingMonths: 0 }))).status).toBe(400);
    expect((await put(make({ billingMonths: 61 }))).status).toBe(400);
    expect((await put(make({ billingMonths: 1.5 }))).status).toBe(400);
    expect((await put(make({ name: 'x' }))).status).toBe(400);
    expect((await put(make({ highlights: Array(11).fill('x') }))).status).toBe(400);
    expect((await put({ price: 10 })).status).toBe(400); // no name
    expect((await put({ ...make(), approvalStatus: 'approved' })).status).toBe(400); // unknown key
  });

  it('refuses to delete a package a gym chose, but deletes an unused one', async () => {
    const used = await createPkg();
    const unused = await createPkg();
    await register({ packageId: used._id });
    const refused = await request(app).delete(`/api/packages/${used._id}`).set(auth(superAdmin.token));
    expect(refused.status).toBe(409);
    expect(refused.body.message).toMatch(/hide it/i);
    expect((await request(app).delete(`/api/packages/${unused._id}`).set(auth(superAdmin.token))).status).toBe(200);
    expect(await SubscriptionPackage.countDocuments()).toBe(1);
    const list = await request(app).get('/api/packages').set(auth(superAdmin.token));
    expect(list.body[0]).toMatchObject({ _id: used._id });
  });
});

describe('the registration page', () => {
  it('shows only active packages, in order, with nothing internal', async () => {
    await createPkg({ name: 'Pro', price: 2999, sortOrder: 2 });
    await createPkg({ name: 'Starter', price: 499, sortOrder: 1, isFeatured: true });
    await createPkg({ name: 'Hidden', isActive: false });
    const cfg = await config();
    expect(cfg.packages.map((p) => p.name)).toEqual(['Starter', 'Pro']);
    expect(cfg.packages[0]).toMatchObject({ price: 499, isFeatured: true, trialDays: 14, maxBranches: 2, maxMembers: 100, highlights: ['QR check-in'] });
    expect(cfg.packages[0].isActive).toBeUndefined();
    expect(cfg.packages[0].gyms).toBeUndefined();
    expect(cfg.packages[0].createdAt).toBeUndefined();
  });

  it('has no packages until the super-admin adds some', async () => {
    expect((await config()).packages).toEqual([]);
  });

  it('shows none while sign-up is switched off', async () => {
    await createPkg();
    await PlatformSettings.updateOne({ key: 'main' }, { $set: { selfSignupEnabled: false } }, { upsert: true });
    const cfg = await config();
    await PlatformSettings.deleteMany({});
    expect(cfg).toMatchObject({ enabled: false, packages: [] });
  });
});

describe('choosing a package when registering', () => {
  it('requires a package once any is on offer', async () => {
    await createPkg();
    const res = await signup(body());
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PACKAGE_REQUIRED');
  });

  it('refuses a hidden, deleted or malformed package id', async () => {
    const hidden = await createPkg({ isActive: false });
    await createPkg();
    expect((await signup(body({ packageId: hidden._id }))).body.code).toBe('PACKAGE_REQUIRED');
    expect((await signup(body({ packageId: '64b000000000000000000000' }))).body.code).toBe('PACKAGE_REQUIRED');
    expect((await signup(body({ packageId: 'nope' }))).status).toBe(400);
  });

  it('remembers the choice and starts the gym waiting', async () => {
    const pkg = await createPkg({ maxBranches: 3, maxMembers: 250 });
    const b = body({ packageId: pkg._id });
    expect((await signup(b)).status).toBe(201);
    const tenant = await Tenant.findOne({ contactEmail: b.email });
    expect(String(tenant.requestedPackageId)).toBe(pkg._id);
    expect(tenant).toMatchObject({ approvalStatus: 'pending', maxBranches: 3, maxMembers: 250 });
    expect(tenant.packageId).toBeUndefined(); // nothing is granted before approval
    const login = await request(app).post('/api/auth/login').send({ email: b.email, password: 'Password123!' });
    expect(login.status).toBe(403);
  });

  it('works as before when no package exists, and refuses an id then', async () => {
    const res = await signup(body());
    expect(res.status).toBe(201);
    expect((await signup(body({ packageId: '64b000000000000000000000' }))).status).toBe(400);
  });

  it('tells platform staff which package the gym chose', async () => {
    const pkg = await createPkg({ name: 'Studio' });
    outbox.length = 0;
    await register({ packageId: pkg._id });
    // The notification is sent in the background after the response.
    for (let i = 0; i < 40 && !outbox.some((m) => m.to === superAdmin.user.email); i += 1) await new Promise((r) => setTimeout(r, 50));
    expect(outbox.some((m) => m.to === superAdmin.user.email && /Studio package/.test(m.text))).toBe(true);
  });
});

describe('approving a gym whose email was never confirmed', () => {
  it('needs the approver to vouch for the email, and then the owner can sign in', async () => {
    const b = body();
    expect((await signup(b)).status).toBe(201); // no confirmation click
    const tenantId = (await User.findOne({ email: b.email })).tenantId.toString();
    const refused = await approve(tenantId);
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe('EMAIL_NOT_CONFIRMED');
    expect((await approve(tenantId, { confirmEmail: false })).status).toBe(400);
    expect((await approve(tenantId, { confirmEmail: true })).status).toBe(200);
    expect(await User.findOne({ email: b.email })).toMatchObject({ emailVerified: true });
    expect((await request(app).post('/api/auth/login').send({ email: b.email, password: 'Password123!' })).status).toBe(200);
  });
});

describe('approving a gym that chose a package', () => {
  it('lists the requested package for the approver', async () => {
    const pkg = await createPkg({ name: 'Studio', price: 1500 });
    const { tenantId } = await register({ packageId: pkg._id });
    const list = await request(app).get('/api/tenants').set(auth(superAdmin.token));
    const row = list.body.find((t) => t._id === tenantId);
    expect(row.requestedPackageId).toMatchObject({ name: 'Studio', price: 1500 });
  });

  it('grants the package terms and starts its trial', async () => {
    const pkg = await createPkg({ name: 'Studio', trialDays: 30, maxBranches: 4, maxMembers: 200 });
    const { b, tenantId } = await register({ packageId: pkg._id });
    const res = await approve(tenantId);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ approvalStatus: 'approved', billingPlan: 'trial', maxBranches: 4, maxMembers: 200, packageName: 'Studio', packageId: pkg._id });
    const days = Math.round((new Date(res.body.trialEndsAt) - Date.now()) / 86400000);
    expect(days).toBe(30);
    expect((await request(app).post('/api/auth/login').send({ email: b.email, password: 'Password123!' })).status).toBe(200);
    expect(outbox.some((m) => m.to === b.email && /30-day free trial/.test(m.text))).toBe(true);
  });

  it('makes a package without a trial live straight away, with unlimited members', async () => {
    const pkg = await createPkg({ name: 'Pro', trialDays: 0, maxMembers: null, maxBranches: 10 });
    const { b, tenantId } = await register({ packageId: pkg._id });
    const res = await approve(tenantId);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ billingPlan: 'basic', maxBranches: 10, packageName: 'Pro' });
    expect(res.body.trialEndsAt).toBeUndefined();
    expect(res.body.maxMembers).toBeUndefined();
    const owner = await request(app).post('/api/auth/login').send({ email: b.email, password: 'Password123!' });
    expect(owner.status).toBe(200);
    expect(owner.body.subscription).toMatchObject({ onTrial: false, trialExpired: false });
    expect(outbox.some((m) => m.to === b.email && /Pro package starts now/.test(m.text) && /unlimited members/.test(m.text))).toBe(true);
  });

  it('lets the approver override the terms for one gym, or pick another package', async () => {
    const asked = await createPkg({ name: 'Starter', trialDays: 14, maxMembers: 50 });
    const other = await createPkg({ name: 'Pro', trialDays: 7, maxMembers: 500, maxBranches: 5 });
    const one = await register({ packageId: asked._id });
    expect((await approve(one.tenantId, { trialDays: 60, maxMembers: 75 })).body).toMatchObject({ packageName: 'Starter', maxMembers: 75, maxBranches: 2 });
    const two = await register({ packageId: asked._id });
    const swapped = await approve(two.tenantId, { packageId: other._id });
    expect(swapped.body).toMatchObject({ packageName: 'Pro', maxMembers: 500, maxBranches: 5 });
    expect(String(swapped.body.requestedPackageId)).toBe(asked._id); // what they asked for is kept
    const three = await register({ packageId: asked._id });
    expect((await approve(three.tenantId, { packageId: '64b000000000000000000000' })).status).toBe(400);
    const four = await register({ packageId: asked._id });
    expect((await approve(four.tenantId, { maxMembers: null })).body.maxMembers).toBeUndefined();
    expect((await approve((await register({ packageId: asked._id })).tenantId, { maxMembers: 0 })).status).toBe(400);
  });

  it('is not changed for a gym already approved when the package is edited later', async () => {
    const pkg = await createPkg({ name: 'Studio', maxMembers: 100 });
    const { tenantId } = await register({ packageId: pkg._id });
    await approve(tenantId);
    await request(app).put(`/api/packages/${pkg._id}`).set(auth(superAdmin.token)).send({ name: 'Renamed', maxMembers: 5 });
    expect(await Tenant.findById(tenantId)).toMatchObject({ packageName: 'Studio', maxMembers: 100 });
    const list = await request(app).get('/api/packages').set(auth(superAdmin.token));
    expect(list.body[0].gyms).toBe(1);
  });

  it('moves an existing gym onto a package: its limits, live now, no trial', async () => {
    const { tenantId } = await register();
    await approve(tenantId); // on the plain free trial
    const pkg = await createPkg({ name: 'Studio', maxBranches: 6, maxMembers: null });
    const res = await request(app).put(`/api/tenants/${tenantId}`).set(auth(superAdmin.token)).send({ packageId: pkg._id, maxBranches: 1 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ packageName: 'Studio', packageId: pkg._id, billingPlan: 'basic', maxBranches: 6 });
    expect(res.body.trialEndsAt).toBeFalsy();
    expect(res.body.maxMembers).toBeFalsy();
    expect((await request(app).put(`/api/tenants/${tenantId}`).set(auth(superAdmin.token)).send({ packageId: '64b000000000000000000000' })).status).toBe(400);
    // An ordinary edit without a packageId leaves the package alone.
    const plain = await request(app).put(`/api/tenants/${tenantId}`).set(auth(superAdmin.token)).send({ name: 'New Name' });
    expect(plain.body).toMatchObject({ name: 'New Name', packageName: 'Studio', maxBranches: 6 });
  });

  it('keeps using the platform trial terms for a gym that chose nothing', async () => {
    const { tenantId } = await register();
    const res = await approve(tenantId);
    expect(res.body).toMatchObject({ billingPlan: 'trial', maxMembers: 50, maxBranches: 1 });
    expect(res.body.packageName).toBeUndefined();
  });

  it('can approve a rejected gym after all and still honours its package', async () => {
    const pkg = await createPkg({ name: 'Studio', maxBranches: 4 });
    const { tenantId } = await register({ packageId: pkg._id });
    expect((await request(app).post(`/api/tenants/${tenantId}/reject`).set(auth(superAdmin.token)).send({ reason: 'Incomplete' })).status).toBe(200);
    expect((await approve(tenantId)).body).toMatchObject({ approvalStatus: 'approved', packageName: 'Studio', maxBranches: 4 });
  });
});
