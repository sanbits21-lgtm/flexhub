const { app, request, connect, disconnect, seedTenant, createSuperAdmin, createMember, login, auth, uniq, PASSWORD } = require('./helpers');
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const SubscriptionPackage = require('../models/SubscriptionPackage');

// Platform staff changing how many branches and members a gym may have.

let su; let t; let other; let paToken; let pkg;
const put = (token, tenant, body) => request(app).put(`/api/tenants/${tenant._id}`).set(auth(token)).send(body);
const fresh = async (tenant) => Tenant.findById(tenant._id);
const newMember = (n) => createMember(t.managerToken, { branchId: t.branch._id.toString(), planId: t.plan._id.toString(), name: `Limit ${n}`, phone: `97${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}` });

beforeAll(async () => {
  await connect();
  su = await createSuperAdmin();
  t = await seedTenant('lim');
  other = await seedTenant('limother');
  const email = `${uniq('pa')}@example.com`;
  await User.create({ name: 'Scoped PA', email, phone: '9000000055', password: PASSWORD, role: 'platform-admin', managedTenantIds: [other.tenant._id] });
  paToken = await login(email);
  pkg = await SubscriptionPackage.create({ name: 'Cap 50', price: 1000, maxBranches: 2, maxMembers: 50 });
}, 120000);
afterAll(disconnect);

// What a gym looks like after it bought a package with a member cap, as the Tenants screen sends it back on a plain edit.
const paidWithCap = async () => {
  await Tenant.updateOne({ _id: t.tenant._id }, { billingPlan: 'basic', maxBranches: 2, maxMembers: 50, trialEndsAt: null, planEndsAt: new Date(Date.now() + 20 * 86400000), packageId: pkg._id, packageName: pkg.name });
};
const plainEdit = (extra = {}) => ({ name: 'Renamed Gym', contactEmail: t.tenant.contactEmail, contactPhone: '', billingPlan: 'basic', billingStatus: 'active', maxBranches: 2, isActive: true, ...extra });

describe('changing the limits', () => {
  it('the super-admin sets how many branches and members a gym may have', async () => {
    await paidWithCap();
    const res = await put(su.token, t.tenant, plainEdit({ maxBranches: 5, maxMembers: 200 }));
    expect(res.status).toBe(200);
    expect(await fresh(t.tenant)).toMatchObject({ maxBranches: 5, maxMembers: 200 });
  });

  it('blank or zero members means no limit', async () => {
    await paidWithCap();
    await put(su.token, t.tenant, plainEdit({ maxMembers: '' }));
    expect((await fresh(t.tenant)).maxMembers).toBeFalsy();
    await paidWithCap();
    await put(su.token, t.tenant, plainEdit({ maxMembers: 0 }));
    expect((await fresh(t.tenant)).maxMembers).toBeFalsy();
  });

  it('refuses limits that make no sense, and changes nothing', async () => {
    await paidWithCap();
    for (const body of [{ maxBranches: 0 }, { maxBranches: 101 }, { maxBranches: 1.5 }, { maxMembers: -5 }, { maxMembers: 100001 }, { maxMembers: 'lots' }]) {
      expect((await put(su.token, t.tenant, plainEdit(body))).status).toBe(400);
    }
    expect(await fresh(t.tenant)).toMatchObject({ maxBranches: 2, maxMembers: 50 });
  });
});

describe('an unrelated edit leaves the member limit alone', () => {
  it('renaming a gym on a paid package keeps its cap', async () => {
    await paidWithCap();
    const res = await put(su.token, t.tenant, plainEdit({ name: 'Only the name changed' })); // no maxMembers in the request
    expect(res.status).toBe(200);
    expect((await fresh(t.tenant)).maxMembers).toBe(50);
  });

  it('moving from one paid plan to another keeps the cap too', async () => {
    await paidWithCap();
    await put(su.token, t.tenant, plainEdit({ billingPlan: 'pro' }));
    expect((await fresh(t.tenant)).maxMembers).toBe(50);
  });

  it('converting a trial to a paid plan still lifts the trial cap, unless a cap is given', async () => {
    await Tenant.updateOne({ _id: t.tenant._id }, { billingPlan: 'trial', maxMembers: 50, trialEndsAt: new Date(Date.now() + 5 * 86400000), $unset: { packageId: '', planEndsAt: '' } });
    await put(su.token, t.tenant, plainEdit({ billingPlan: 'basic' }));
    expect((await fresh(t.tenant)).maxMembers).toBeFalsy();
    await Tenant.updateOne({ _id: t.tenant._id }, { billingPlan: 'trial', maxMembers: 50, trialEndsAt: new Date(Date.now() + 5 * 86400000) });
    await put(su.token, t.tenant, plainEdit({ billingPlan: 'basic', maxMembers: 80 }));
    expect((await fresh(t.tenant)).maxMembers).toBe(80);
  });
});

describe('the limits are enforced', () => {
  it('a gym at its member limit cannot add another, and can again once the limit is raised', async () => {
    await paidWithCap();
    await Tenant.updateOne({ _id: t.tenant._id }, { maxMembers: 1 });
    const used = await require('../models/Member').countDocuments({ tenantId: t.tenant._id, isActive: true });
    await Tenant.updateOne({ _id: t.tenant._id }, { maxMembers: used + 1 });
    await newMember('fills the last slot');
    const refused = await request(app).post('/api/members').set(auth(t.managerToken)).send({ name: 'One too many', phone: '9712345600', branchId: t.branch._id.toString(), membershipPlanId: t.plan._id.toString() });
    expect(refused.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(refused.body)).toMatch(/limit|allow|member/i);
    await put(su.token, t.tenant, plainEdit({ maxMembers: used + 5 }));
    await newMember('after the raise');
  });

  it('a gym at its branch limit cannot add a branch, and can once it is raised', async () => {
    await paidWithCap();
    await Tenant.updateOne({ _id: t.tenant._id }, { maxBranches: 1 });
    const refused = await request(app).post('/api/branches').set(auth(t.adminToken)).send({ name: 'Second' });
    expect(refused.status).toBe(403);
    expect(refused.body.message).toMatch(/Branch limit/);
    await put(su.token, t.tenant, plainEdit({ maxBranches: 3 }));
    expect((await request(app).post('/api/branches').set(auth(t.adminToken)).send({ name: 'Second' })).status).toBe(201);
  });
});

describe('who may change them', () => {
  it('platform staff only, and a scoped platform admin only for their own gyms', async () => {
    await paidWithCap();
    expect((await put(t.adminToken, t.tenant, plainEdit({ maxMembers: 9999 }))).status).toBe(403); // the gym itself cannot raise its own limit
    expect((await put(t.managerToken, t.tenant, plainEdit({ maxMembers: 9999 }))).status).toBe(403);
    expect((await put(paToken, t.tenant, plainEdit({ maxMembers: 9999 }))).status).toBe(404); // manages another gym
    expect((await fresh(t.tenant)).maxMembers).toBe(50);
    await Tenant.updateOne({ _id: other.tenant._id }, { billingPlan: 'basic', maxMembers: 10 });
    const own = await put(paToken, other.tenant, { name: 'Other renamed', contactEmail: other.tenant.contactEmail, contactPhone: '', billingPlan: 'basic', billingStatus: 'active', maxBranches: 4, maxMembers: 75, isActive: true });
    expect(own.status).toBe(200);
    expect(await fresh(other.tenant)).toMatchObject({ maxBranches: 4, maxMembers: 75 });
  });
});
