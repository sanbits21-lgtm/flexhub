const { app, request, connect, disconnect, seedTenant, createSuperAdmin, login, auth, uniq, PASSWORD } = require('./helpers');
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const AuditLog = require('../models/AuditLog');

// Platform staff giving a gym on a free trial more time.

const day = 86400000;
let su; let t; let other; let paToken;
const extend = (token, tenant, body) => request(app).post(`/api/tenants/${tenant._id}/extend-trial`).set(auth(token)).send(body);
const trialEnd = async (tenant) => (await Tenant.findById(tenant._id)).trialEndsAt;
const daysFromNow = (d) => (d - Date.now()) / day;

beforeAll(async () => {
  await connect();
  su = await createSuperAdmin();
  t = await seedTenant('trial');
  other = await seedTenant('trialother');
  const email = `${uniq('pa')}@example.com`;
  await User.create({ name: 'Scoped PA', email, phone: '9000000088', password: PASSWORD, role: 'platform-admin', managedTenantIds: [other.tenant._id] });
  paToken = await login(email);
}, 120000);
afterAll(disconnect);

beforeEach(async () => {
  await Tenant.updateOne({ _id: t.tenant._id }, { billingPlan: 'trial', approvalStatus: 'approved', trialEndsAt: new Date(Date.now() + 5 * day), $unset: { planEndsAt: '' } });
});

describe('extending by days', () => {
  it('adds the days to the current end of a trial that is still running', async () => {
    const before = await trialEnd(t.tenant);
    const res = await extend(su.token, t.tenant, { days: 14 });
    expect(res.status).toBe(200);
    expect((await trialEnd(t.tenant) - before) / day).toBeCloseTo(14, 1);
  });

  it('counts from today when the trial has already ended, and lets the gym write again', async () => {
    await Tenant.updateOne({ _id: t.tenant._id }, { trialEndsAt: new Date(Date.now() - 10 * day) });
    expect((await request(app).post('/api/branches').set(auth(t.adminToken)).send({ name: 'Locked' })).status).toBe(402); // read-only while ended
    const res = await extend(su.token, t.tenant, { days: 7 });
    expect(res.status).toBe(200);
    expect(daysFromNow(await trialEnd(t.tenant))).toBeCloseTo(7, 0); // not -3
    expect((await request(app).post('/api/branches').set(auth(t.adminToken)).send({ name: 'Unlocked' })).status).not.toBe(402);
  });

  it('starts the reminder emails again for the new end date', async () => {
    await Tenant.updateOne({ _id: t.tenant._id }, { expiryNotice: { stage: 1, forEnd: new Date(), sentAt: new Date() } });
    await extend(su.token, t.tenant, { days: 3 });
    const notice = (await Tenant.findById(t.tenant._id)).expiryNotice;
    expect(notice?.forEnd).toBeUndefined();
    expect(notice?.stage).toBeUndefined();
  });

  it('is written to the audit log with the old and new end', async () => {
    await extend(su.token, t.tenant, { days: 2 });
    const log = await AuditLog.findOne({ action: 'EXTEND_TRIAL', targetId: t.tenant._id }).sort({ createdAt: -1 });
    expect(log).toBeTruthy();
    expect(log.metadata).toMatchObject({ days: 2 });
    expect(log.metadata.from).toBeTruthy();
    expect(log.metadata.to).toBeTruthy();
  });
});

describe('setting the end date', () => {
  it('sets the trial to end on that day', async () => {
    const date = new Date(Date.now() + 40 * day);
    const res = await extend(su.token, t.tenant, { endsAt: date.toISOString() });
    expect(res.status).toBe(200);
    expect(Math.abs(await trialEnd(t.tenant) - date)).toBeLessThan(1000);
  });

  it('can bring the end date earlier, but never into the past', async () => {
    const sooner = new Date(Date.now() + 2 * day);
    expect((await extend(su.token, t.tenant, { endsAt: sooner.toISOString() })).status).toBe(200);
    expect(daysFromNow(await trialEnd(t.tenant))).toBeCloseTo(2, 0);
    const res = await extend(su.token, t.tenant, { endsAt: new Date(Date.now() - day).toISOString() });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/future/);
  });
});

describe('refuses nonsense', () => {
  it('needs exactly one of days or an end date, within sensible limits', async () => {
    expect((await extend(su.token, t.tenant, {})).status).toBe(400);
    expect((await extend(su.token, t.tenant, { days: 5, endsAt: new Date(Date.now() + 9 * day).toISOString() })).status).toBe(400);
    for (const days of [0, -3, 366, 1.5, 'lots']) expect((await extend(su.token, t.tenant, { days })).status).toBe(400);
    expect((await extend(su.token, t.tenant, { endsAt: 'not a date' })).status).toBe(400);
    expect((await extend(su.token, t.tenant, { endsAt: new Date(Date.now() + 3 * 366 * day).toISOString() })).status).toBe(400); // over two years
    expect(daysFromNow(await trialEnd(t.tenant))).toBeCloseTo(5, 0); // nothing changed
  });

  it('is for a gym that is on a trial and approved', async () => {
    await Tenant.updateOne({ _id: t.tenant._id }, { billingPlan: 'basic', planEndsAt: new Date(Date.now() + 20 * day) });
    const paid = await extend(su.token, t.tenant, { days: 7 });
    expect(paid.status).toBe(409);
    expect(paid.body.message).toMatch(/Renew/);
    await Tenant.updateOne({ _id: t.tenant._id }, { billingPlan: 'trial', approvalStatus: 'pending' });
    expect((await extend(su.token, t.tenant, { days: 7 })).status).toBe(409);
  });
});

describe('who can do it', () => {
  it('platform staff only, and a scoped platform admin only for their own gyms', async () => {
    expect((await extend(t.adminToken, t.tenant, { days: 7 })).status).toBe(403); // the gym's own owner
    expect((await extend(t.managerToken, t.tenant, { days: 7 })).status).toBe(403);
    expect((await request(app).post(`/api/tenants/${t.tenant._id}/extend-trial`).send({ days: 7 })).status).toBe(401);
    expect((await extend(paToken, t.tenant, { days: 7 })).status).toBe(404); // manages another gym
    await Tenant.updateOne({ _id: other.tenant._id }, { billingPlan: 'trial', trialEndsAt: new Date(Date.now() + 3 * day) });
    expect((await extend(paToken, other.tenant, { days: 7 })).status).toBe(200);
  });
});
