const { app, request, connect, disconnect, seedTenant, createMember, createSuperAdmin, auth, uniq, login, PASSWORD } = require('./helpers');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const SubscriptionPackage = require('../models/SubscriptionPackage');
const TenantSubscriptionInvoice = require('../models/TenantSubscriptionInvoice');
const { outbox } = require('../utils/mailer');
const { addMonths, subscriptionOf, DAY, GRACE_DAYS } = require('../utils/subscription');
const { runExpiryNotices } = require('../utils/expiryNotices');

let superAdmin; let platformAdmin;
const days = (n) => new Date(Date.now() + n * DAY);
const put = (id, body, token = superAdmin.token) => request(app).put(`/api/tenants/${id}`).set(auth(token)).send(body);
const renew = (id, body = {}, token = superAdmin.token) => request(app).post(`/api/tenants/${id}/renew`).set(auth(token)).send(body);
const write = (t) => request(app).post('/api/branches').set(auth(t.adminToken)).send({ name: uniq('Branch') });
const mailsTo = (to) => outbox.filter((m) => m.to === to);
const sameDay = (a, b) => Math.abs(new Date(a) - new Date(b)) < 2 * 60 * 1000;

// A seeded gym on a paid plan that ends `endsInDays` from now.
const paidGym = async (endsInDays, over = {}) => {
  const t = await seedTenant('paid');
  await Tenant.updateOne({ _id: t.tenant._id }, { billingPlan: 'basic', packageName: 'Studio', maxBranches: 50, planEndsAt: days(endsInDays), ...over });
  return t;
};

beforeAll(async () => {
  await connect();
  superAdmin = await createSuperAdmin();
  const pa = await User.create({ name: 'PA', email: `pa-${uniq('pa')}@example.com`, phone: '9000000008', password: PASSWORD, role: 'platform-admin' });
  platformAdmin = { user: pa, token: await login(pa.email) };
}, 90000);
beforeEach(() => { outbox.length = 0; });
afterAll(async () => {
  await SubscriptionPackage.deleteMany({});
  await disconnect();
});

describe('adding months', () => {
  it('clamps to the end of a shorter month and rolls over years', () => {
    expect(addMonths(new Date('2027-01-31T10:00:00Z'), 1).toISOString()).toBe('2027-02-28T10:00:00.000Z');
    expect(addMonths(new Date('2028-01-31T10:00:00Z'), 1).toISOString()).toBe('2028-02-29T10:00:00.000Z');
    expect(addMonths(new Date('2026-11-15T00:00:00Z'), 3).toISOString()).toBe('2027-02-15T00:00:00.000Z');
    expect(addMonths(new Date('2026-12-31T00:00:00Z'), 12).toISOString()).toBe('2027-12-31T00:00:00.000Z');
  });
});

describe('a paid plan running out', () => {
  it('keeps working until the end, then through the grace days with a warning, then goes read-only', async () => {
    const t = await paidGym(10);
    expect((await write(t)).status).not.toBe(402);

    await Tenant.updateOne({ _id: t.tenant._id }, { planEndsAt: days(-1) }); // ended yesterday, inside grace
    expect((await write(t)).status).not.toBe(402);
    const grace = await request(app).get('/api/auth/me').set(auth(t.adminToken));
    expect(grace.body.subscription).toMatchObject({ planExpired: true, planLocked: false, planDaysLeft: 0, packageName: 'Studio', graceDays: GRACE_DAYS });

    await Tenant.updateOne({ _id: t.tenant._id }, { planEndsAt: days(-(GRACE_DAYS + 1)) });
    const locked = await write(t);
    expect(locked.status).toBe(402);
    expect(locked.body.code).toBe('PLAN_EXPIRED');
    expect((await request(app).get('/api/branches').set(auth(t.adminToken))).status).toBe(200); // can still read
    expect((await request(app).get('/api/auth/me').set(auth(t.adminToken))).body.subscription.planLocked).toBe(true);
  });

  it('never expires a gym that has no end date', async () => {
    const t = await paidGym(0, { planEndsAt: undefined });
    await Tenant.updateOne({ _id: t.tenant._id }, { $unset: { planEndsAt: 1 } });
    expect((await write(t)).status).not.toBe(402);
    expect(subscriptionOf(await Tenant.findById(t.tenant._id))).toMatchObject({ planEndsAt: null, planExpired: false, planLocked: false });
  });

  it('does not lock the members of a gym whose plan ended', async () => {
    const t = await paidGym(10);
    const m = await createMember(t.managerToken, { branchId: t.branch._id.toString(), planId: t.plan._id.toString(), name: 'Mem', phone: '9400000002' });
    const access = await request(app).post(`/api/members/${m._id}/app-access`).set(auth(t.managerToken));
    const token = (await request(app).post('/api/member-auth/login').send({ identifier: access.body.memberCode, password: access.body.password })).body.token;
    await Tenant.updateOne({ _id: t.tenant._id }, { planEndsAt: days(-30) });
    expect((await write(t)).status).toBe(402); // staff are locked
    expect((await request(app).get('/api/member-app/me').set(auth(token))).status).toBe(200); // members are not
  });

  it('still locks a trial the old way, with its own code', async () => {
    const t = await seedTenant('trial');
    await Tenant.updateOne({ _id: t.tenant._id }, { billingPlan: 'trial', trialEndsAt: days(-1) });
    const res = await write(t);
    expect(res.status).toBe(402);
    expect(res.body.code).toBe('TRIAL_ENDED');
  });
});

describe('plan dates when a package is granted', () => {
  const pkg = (over = {}) => SubscriptionPackage.create({ name: 'Studio', price: 3000, billingMonths: 3, trialDays: 0, maxBranches: 4, maxMembers: 300, ...over });

  it('starts a paid period at approval for a package with no trial, and none for a trial', async () => {
    const live = await pkg();
    const regs = [];
    for (const p of [live, await pkg({ name: 'Trialled', trialDays: 14 })]) {
      const id = uniq('reg').toLowerCase();
      const email = `owner-${id}@example.com`;
      await request(app).post('/api/public/signup').send({ gymName: `Exp ${id} Fitness`, ownerName: 'Asha', email, phone: '9800001111', password: 'Orchid-Lantern-47!', packageId: String(p._id) });
      const token = outbox.filter((m) => m.to === email)[0].text.match(/token=([0-9a-f]{64})/)[1];
      await request(app).post('/api/public/verify-email').send({ token });
      const tenantId = (await User.findOne({ email })).tenantId.toString();
      regs.push((await request(app).post(`/api/tenants/${tenantId}/approve`).set(auth(superAdmin.token)).send({})).body);
    }
    expect(regs[0].billingPlan).toBe('basic');
    expect(sameDay(regs[0].planEndsAt, addMonths(new Date(), 3))).toBe(true);
    expect(regs[1].billingPlan).toBe('trial');
    expect(regs[1].planEndsAt).toBeUndefined();
    await SubscriptionPackage.deleteMany({});
  });

  it('starts a paid period when an existing gym is moved onto a package', async () => {
    const p = await pkg({ billingMonths: 6 });
    const t = await seedTenant('move');
    const res = await put(t.tenant._id, { packageId: String(p._id) });
    expect(res.status).toBe(200);
    expect(sameDay(res.body.planEndsAt, addMonths(new Date(), 6))).toBe(true);
    await SubscriptionPackage.deleteMany({});
  });
});

describe('renewing', () => {
  it('after the plan has run out starts from today, records the payment, and unlocks the gym', async () => {
    const t = await paidGym(-10);
    expect((await write(t)).status).toBe(402);
    const res = await renew(t.tenant._id, { months: 2, amount: 1500 });
    expect(res.status).toBe(200);
    expect(sameDay(res.body.tenant.planEndsAt, addMonths(new Date(), 2))).toBe(true);
    expect(res.body.invoice).toMatchObject({ amount: 1500, status: 'paid', billingPlan: 'Studio' });
    expect(await TenantSubscriptionInvoice.countDocuments({ tenantId: t.tenant._id })).toBe(1);
    expect((await write(t)).status).not.toBe(402);
    expect(mailsTo(t.admin.email).some((m) => /renewed until/.test(m.subject))).toBe(true);
  });

  it('early adds on to the current end, so paying early loses nothing', async () => {
    const end = days(20);
    const t = await paidGym(20);
    const res = await renew(t.tenant._id, { months: 1 });
    expect(sameDay(res.body.tenant.planEndsAt, addMonths(end, 1))).toBe(true);
  });

  it("defaults to the gym's package price and period", async () => {
    const p = await SubscriptionPackage.create({ name: 'Studio', price: 2400, billingMonths: 12, maxBranches: 4 });
    const t = await paidGym(5, { packageId: p._id });
    const res = await renew(t.tenant._id);
    expect(res.body.invoice.amount).toBe(2400);
    expect(sameDay(res.body.tenant.planEndsAt, addMonths(days(5), 12))).toBe(true);
    await SubscriptionPackage.deleteMany({});
  });

  it('turns a trial into a paid plan', async () => {
    const t = await seedTenant('conv');
    await Tenant.updateOne({ _id: t.tenant._id }, { billingPlan: 'trial', trialEndsAt: days(-2), maxMembers: 50 });
    const res = await renew(t.tenant._id, { months: 1, amount: 500 });
    expect(res.body.tenant).toMatchObject({ billingPlan: 'basic' });
    expect(res.body.tenant.trialEndsAt).toBeUndefined();
    expect(res.body.tenant.maxMembers).toBeUndefined();
    expect((await write(t)).status).not.toBe(402);
  });

  it('can be done by platform admins only, and rejects nonsense', async () => {
    const t = await paidGym(5);
    expect((await renew(t.tenant._id, {}, t.adminToken)).status).toBe(403);
    expect((await renew(t.tenant._id, { months: 1 }, platformAdmin.token)).status).toBe(200);
    expect((await renew(t.tenant._id, { months: 0 })).status).toBe(400);
    expect((await renew(t.tenant._id, { months: 61 })).status).toBe(400);
    expect((await renew(t.tenant._id, { months: 1.5 })).status).toBe(400);
    expect((await renew(t.tenant._id, { amount: -1 })).status).toBe(400);
    expect((await renew('64b000000000000000000000')).status).toBe(404);
    const waiting = await Tenant.create({ name: 'Waiting', slug: uniq('wait'), contactEmail: 'w@example.com', approvalStatus: 'pending' });
    expect((await renew(waiting._id)).status).toBe(409);
  });
});

describe('editing a gym is validated', () => {
  it('refuses values that used to be stored as typed', async () => {
    const t = await seedTenant('val');
    const id = t.tenant._id;
    for (const bad of [{ maxBranches: 0 }, { maxBranches: -3 }, { maxBranches: 101 }, { maxBranches: 1.5 }, { maxBranches: 'lots' },
      { billingPlan: 'gold' }, { billingStatus: 'maybe' }, { contactEmail: 'not-an-email' }, { name: '' }, { isActive: 'yes' },
      { planEndsAt: 'tomorrow-ish' }, { trialEndsAt: '1999-01-01' }, { planEndsAt: '2099-01-01' }, { packageId: 'junk' }, { maxMembers: -5 }, { maxMembers: 1e9 }]) {
      const res = await put(id, bad);
      expect([bad, res.status]).toEqual([bad, 400]);
    }
    expect(await Tenant.findById(id)).toMatchObject({ maxBranches: 5, billingPlan: 'trial' });
  });

  it('still accepts good edits, and clears dates and the member cap with blanks', async () => {
    const t = await seedTenant('good');
    const id = t.tenant._id;
    const ok = await put(id, { name: 'Renamed Gym', contactPhone: '', maxBranches: '3', billingStatus: 'past_due', planEndsAt: days(30).toISOString(), maxMembers: 120 });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ name: 'Renamed Gym', maxBranches: 3, billingStatus: 'past_due', maxMembers: 120 });
    expect(ok.body.planEndsAt).toBeTruthy();
    const cleared = await put(id, { planEndsAt: '', maxMembers: '' });
    expect(cleared.status).toBe(200);
    expect(cleared.body.planEndsAt).toBeFalsy();
    expect(cleared.body.maxMembers).toBeFalsy();
  });
});

describe('ending-soon emails', () => {
  const stages = (t) => mailsTo(t.admin.email).map((m) => m.subject);

  it('goes out once a week before, once on the last day, and once when it ends', async () => {
    const t = await paidGym(5);
    await runExpiryNotices();
    expect(stages(t)).toHaveLength(1);
    expect(stages(t)[0]).toMatch(/ends in [45] days/);
    await runExpiryNotices();
    expect(stages(t)).toHaveLength(1); // not again

    await Tenant.updateOne({ _id: t.tenant._id }, { planEndsAt: days(0.5) });
    await runExpiryNotices();
    expect(stages(t)).toHaveLength(2);
    expect(stages(t)[1]).toMatch(/ends tomorrow/);

    await Tenant.updateOne({ _id: t.tenant._id }, { planEndsAt: days(-0.5) });
    await runExpiryNotices();
    expect(stages(t)).toHaveLength(3);
    expect(mailsTo(t.admin.email)[2].text).toMatch(new RegExp(`${GRACE_DAYS} more days`));
    await runExpiryNotices();
    expect(stages(t)).toHaveLength(3);
  });

  it('starts again after a renewal', async () => {
    const t = await paidGym(3);
    await runExpiryNotices();
    expect(stages(t)).toHaveLength(1);
    expect((await renew(t.tenant._id, { months: 1 })).status).toBe(200);
    outbox.length = 0;
    await Tenant.updateOne({ _id: t.tenant._id }, { planEndsAt: days(2) });
    await runExpiryNotices();
    expect(stages(t)).toHaveLength(1);
  });

  it('covers trials too, in trial wording', async () => {
    const t = await seedTenant('trialmail');
    await Tenant.updateOne({ _id: t.tenant._id }, { billingPlan: 'trial', trialEndsAt: days(2) });
    await runExpiryNotices();
    expect(stages(t)[0]).toMatch(/free trial ends in/);
  });

  it('skips gyms that are far from the end, long past it, suspended, unapproved, or have no end date', async () => {
    const far = await paidGym(40);
    const old = await paidGym(-60);
    const suspended = await paidGym(2, { billingStatus: 'suspended', isActive: false });
    const waiting = await paidGym(2, { approvalStatus: 'pending' });
    const open = await paidGym(0);
    await Tenant.updateOne({ _id: open.tenant._id }, { $unset: { planEndsAt: 1 } });
    await runExpiryNotices();
    for (const t of [far, old, suspended, waiting, open]) expect(stages(t)).toEqual([]);
  });

  it('does not double-send when two runs overlap', async () => {
    const t = await paidGym(3);
    await Promise.all([runExpiryNotices(), runExpiryNotices(), runExpiryNotices()]);
    expect(stages(t)).toHaveLength(1);
  });

  it('falls back to the contact address when a gym has no owner', async () => {
    const t = await paidGym(3);
    await User.deleteMany({ tenantId: t.tenant._id, role: 'tenant-admin' });
    await runExpiryNotices();
    expect(mailsTo(`${t.tenant.slug}@example.com`)).toHaveLength(1);
  });

  it('tells platform staff which gyms were just emailed', async () => {
    const t = await paidGym(1, { name: 'Zed Fitness Club' });
    await runExpiryNotices();
    const summary = outbox.find((m) => m.to === superAdmin.user.email && /Plans to follow up/.test(m.text));
    expect(summary.text).toMatch(/Zed Fitness Club \(Studio\)/);
    expect(t).toBeTruthy();
  });
});
