const { app, request, connect, disconnect, seedTenant, createMember, createSuperAdmin, login, auth, uniq, PASSWORD } = require('./helpers');
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const PlatformSettings = require('../models/PlatformSettings');
const SubscriptionPackage = require('../models/SubscriptionPackage');
const SubscriptionOrder = require('../models/SubscriptionOrder');
const TenantSubscriptionInvoice = require('../models/TenantSubscriptionInvoice');
const photos = require('./photoFixtures');

// A gym owner buys or renews a plan by paying the platform's UPI QR; platform staff confirm it by hand.

const PNG = photos.b64(photos.png(256, 256));
const day = 86400000;
let su; let t; let other; let starter; let pro; let free; let hidden; let paToken; let pa;
const utr = () => String(Math.floor(1e11 + Math.random() * 9e11));

const get = (token, url) => request(app).get(url).set(auth(token));
const post = (token, url, body) => request(app).post(url).set(auth(token)).send(body);
const order = (token, packageId, extra = {}) => post(token, '/api/billing/orders', { packageId: String(packageId), ...extra });

beforeAll(async () => {
  await connect();
  await PlatformSettings.deleteMany({});
  su = await createSuperAdmin();
  t = await seedTenant('bill');
  other = await seedTenant('billother');
  await Tenant.updateOne({ _id: t.tenant._id }, { billingPlan: 'trial', trialEndsAt: new Date(Date.now() + 5 * day) });
  await Tenant.updateOne({ _id: other.tenant._id }, { billingPlan: 'trial', trialEndsAt: new Date(Date.now() + 5 * day) });
  starter = await SubscriptionPackage.create({ name: 'Starter', price: 1000, billingMonths: 1, maxBranches: 1, maxMembers: 50 });
  pro = await SubscriptionPackage.create({ name: 'Pro', price: 2500, billingMonths: 1, maxBranches: 5 });
  free = await SubscriptionPackage.create({ name: 'Free forever', price: 0, maxBranches: 1, maxMembers: 10 });
  hidden = await SubscriptionPackage.create({ name: 'Hidden', price: 900, maxBranches: 1, isActive: false });
  const email = `${uniq('pa')}@example.com`;
  pa = await User.create({ name: 'PA', email, phone: '9000000044', password: PASSWORD, role: 'platform-admin', managedTenantIds: [other.tenant._id] });
  paToken = await login(email);
}, 120000);
afterAll(disconnect);

describe('before the platform has a payment account', () => {
  it('shows the plans but cannot take an order', async () => {
    const res = await get(t.adminToken, '/api/billing');
    expect(res.status).toBe(200);
    expect(res.body.payment.enabled).toBe(false);
    expect((await order(t.adminToken, starter._id)).status).toBe(503);
  });
});

describe('platform billing settings', () => {
  it('only the super-admin sets them, and the UPI ID must be real', async () => {
    const put = (token, body) => request(app).put('/api/platform-settings').set(auth(token)).send(body);
    expect((await put(t.adminToken, { billingUpiId: 'x@okbank' })).status).toBe(403);
    expect((await put(su.token, { billingUpiId: 'not a upi id' })).status).toBe(400);
    expect((await put(su.token, { billingGstPercent: 40 })).status).toBe(400);
    const ok = await put(su.token, { billingUpiId: 'platform@okbank', billingPayeeName: 'FitzyClub', billingGstPercent: 18 });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ billingUpiId: 'platform@okbank', billingPayeeName: 'FitzyClub', billingGstPercent: 18 });
  });
});

describe('choosing a plan', () => {
  it('lists the packages on offer with the price worked out, tax included', async () => {
    const res = await get(t.adminToken, '/api/billing');
    expect(res.body.payment).toEqual({ enabled: true, gstPercent: 18 });
    const names = res.body.packages.map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(['Starter', 'Pro', 'Free forever']));
    expect(names).not.toContain('Hidden');
    const s = res.body.packages.find((p) => p.name === 'Starter');
    expect(s.quote).toMatchObject({ base: 1000, gst: 180, total: 1180 });
    expect(res.body.packages.find((p) => p.name === 'Free forever')).toMatchObject({ selectable: false, quote: null });
  });

  it('creates an order with the amount fixed on the server, and a UPI link that carries it', async () => {
    const res = await order(t.adminToken, starter._id);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'created', kind: 'upgrade', amount: 1000, gstAmount: 180, total: 1180, periods: 1, months: 1 });
    expect(res.body.reference).toMatch(/^FC[A-Z2-9]{6}$/);
    const link = new URL(res.body.payment.upiLink.replace('upi://pay', 'https://x.test/pay'));
    expect(link.searchParams.get('pa')).toBe('platform@okbank');
    expect(link.searchParams.get('am')).toBe('1180.00');
    expect(link.searchParams.get('tn')).toBe(res.body.reference);
  });

  it('ignores any price the browser sends, and buys several periods at once', async () => {
    const res = await order(t.adminToken, starter._id, { periods: 3, total: 1, amount: 1 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ amount: 3000, total: 3540, months: 3 });
  });

  it('a new choice replaces the unpaid one', async () => {
    const first = (await order(t.adminToken, starter._id)).body;
    const second = (await order(t.adminToken, pro._id)).body;
    expect((await SubscriptionOrder.findById(first._id)).status).toBe('cancelled');
    expect((await get(t.adminToken, '/api/billing')).body.openOrder._id).toBe(second._id);
  });

  it('refuses a hidden package, a free one, a made-up one, and too many periods', async () => {
    expect((await order(t.adminToken, hidden._id)).status).toBe(400);
    const f = await order(t.adminToken, free._id);
    expect(f.status).toBe(400);
    expect(f.body.message).toMatch(/contact us/i);
    expect((await order(t.adminToken, '64b64b64b64b64b64b64b64')).status).toBe(400);
    expect((await order(t.adminToken, starter._id, { periods: 13 })).status).toBe(400);
  });

  it('refuses a package the gym is too big for, saying why', async () => {
    const tiny = await SubscriptionPackage.create({ name: 'Tiny', price: 100, maxBranches: 1, maxMembers: 1 });
    await createMember(t.managerToken, { branchId: t.branch._id.toString(), planId: t.plan._id.toString(), name: 'M1', phone: '9800000001' });
    await createMember(t.managerToken, { branchId: t.branch._id.toString(), planId: t.plan._id.toString(), name: 'M2', phone: '9800000002' });
    const res = await order(t.adminToken, tiny._id);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'OVER_LIMIT' });
    expect(res.body.message).toMatch(/2 members/);
  });

  it('only the owner can use it', async () => {
    expect((await get(t.managerToken, '/api/billing')).status).toBe(403);
    expect((await get(t.trainerToken, '/api/billing')).status).toBe(403);
    expect((await request(app).get('/api/billing')).status).toBe(401);
  });
});

describe('saying "I have paid"', () => {
  let o;
  beforeAll(async () => { o = (await order(t.adminToken, starter._id)).body; });

  it('needs the 12-digit transaction number', async () => {
    for (const bad of ['', '12345', 'ABCDEFGHIJKL', '1234567890123']) {
      expect((await post(t.adminToken, `/api/billing/orders/${o._id}/submit`, { utr: bad })).status).toBe(400);
    }
  });

  it('moves the order to waiting for confirmation, keeps the screenshot, and blocks a second order meanwhile', async () => {
    const number = utr();
    const res = await post(t.adminToken, `/api/billing/orders/${o._id}/submit`, { utr: number, image: PNG });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'awaiting_confirmation', utr: number, hasProof: true });
    expect(res.body.proofFile).toBeUndefined();
    expect(res.body.utrKey).toBeUndefined();
    expect((await order(t.adminToken, pro._id)).body).toMatchObject({ code: 'PAYMENT_PENDING' });
    expect((await post(t.adminToken, `/api/billing/orders/${o._id}/submit`, { utr: utr() })).status).toBe(409); // twice
    const proof = await get(t.adminToken, `/api/billing/orders/${o._id}/proof`);
    expect(proof.status).toBe(200);
    expect(proof.headers['content-type']).toBe('image/png');
  });

  it('one transaction number cannot back two orders, even from another gym', async () => {
    const mine = await SubscriptionOrder.findById(o._id);
    const theirs = (await order(other.adminToken, starter._id)).body;
    const res = await post(other.adminToken, `/api/billing/orders/${theirs._id}/submit`, { utr: mine.utr });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('UTR_USED');
    expect((await SubscriptionOrder.findById(theirs._id)).status).toBe('created');
  });

  it("another gym cannot see, cancel, or read this gym's order or proof", async () => {
    expect((await get(other.adminToken, `/api/billing/orders/${o._id}`)).status).toBe(404);
    expect((await get(other.adminToken, `/api/billing/orders/${o._id}/proof`)).status).toBe(404);
    expect((await post(other.adminToken, `/api/billing/orders/${o._id}/cancel`, {})).status).toBe(409);
    expect((await SubscriptionOrder.findById(o._id)).status).toBe('awaiting_confirmation');
  });

  it('a request nobody paid in time expires, and cannot be submitted', async () => {
    await SubscriptionOrder.updateOne({ _id: (await SubscriptionOrder.findOne({ tenantId: other.tenant._id, status: 'created' }))._id }, { expiresAt: new Date(Date.now() - 1000) });
    const overview = (await get(other.adminToken, '/api/billing')).body;
    expect(overview.openOrder).toBeNull();
    const stale = await SubscriptionOrder.findOne({ tenantId: other.tenant._id, status: 'expired' });
    expect(stale).toBeTruthy();
    expect((await post(other.adminToken, `/api/billing/orders/${stale._id}/submit`, { utr: utr() })).status).toBe(409);
  });
});

describe('platform staff confirming', () => {
  let o;
  beforeAll(async () => { o = await SubscriptionOrder.findOne({ tenantId: t.tenant._id, status: 'awaiting_confirmation' }); });

  it('is for platform staff only', async () => {
    expect((await get(t.adminToken, '/api/billing-admin/orders')).status).toBe(403);
    expect((await get(t.managerToken, '/api/billing-admin/orders')).status).toBe(403);
    expect((await post(t.adminToken, `/api/billing-admin/orders/${o._id}/approve`, { received: 9999 })).status).toBe(403);
  });

  it('lists what is waiting, with the gym and the proof', async () => {
    const list = (await get(su.token, '/api/billing-admin/orders')).body;
    const mine = list.find((x) => x._id === String(o._id));
    expect(mine).toMatchObject({ status: 'awaiting_confirmation', total: 1180, hasProof: true });
    expect(mine.tenant.name).toBe(t.tenant.name);
    expect((await get(su.token, `/api/billing-admin/orders/${o._id}/proof`)).status).toBe(200);
  });

  it('a scoped platform admin sees and handles only their own gyms', async () => {
    expect((await get(paToken, '/api/billing-admin/orders')).body.some((x) => x._id === String(o._id))).toBe(false);
    expect((await post(paToken, `/api/billing-admin/orders/${o._id}/approve`, { received: 1180 })).status).toBe(404);
    expect((await get(paToken, `/api/billing-admin/orders/${o._id}/proof`)).status).toBe(404);
  });

  it('needs the amount that arrived, and refuses less than is due', async () => {
    expect((await post(su.token, `/api/billing-admin/orders/${o._id}/approve`, {})).status).toBe(400);
    const short = await post(su.token, `/api/billing-admin/orders/${o._id}/approve`, { received: 1000 });
    expect(short.status).toBe(400);
    expect(short.body.message).toMatch(/1180/);
    expect((await SubscriptionOrder.findById(o._id)).status).toBe('awaiting_confirmation');
  });

  it('approving puts the plan into effect: package, limits, end date, a paid invoice', async () => {
    const res = await post(su.token, `/api/billing-admin/orders/${o._id}/approve`, { received: 1180 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'paid', receivedAmount: 1180 });
    const tenant = await Tenant.findById(t.tenant._id);
    expect(tenant).toMatchObject({ billingPlan: 'basic', packageName: 'Starter', maxBranches: 1, maxMembers: 50 });
    expect(tenant.trialEndsAt).toBeUndefined();
    const days = (tenant.planEndsAt - Date.now()) / day;
    expect(days).toBeGreaterThan(27);
    expect(days).toBeLessThan(32);
    const invoice = await TenantSubscriptionInvoice.findOne({ tenantId: t.tenant._id });
    expect(invoice).toMatchObject({ amount: 1180, status: 'paid', billingPlan: 'Starter', gatewayRef: o.reference });
    const fresh = await SubscriptionOrder.findById(o._id);
    expect(fresh.invoiceId.toString()).toBe(invoice._id.toString());
    // and the owner now sees a paid plan, not a trial
    const overview = (await get(t.adminToken, '/api/billing')).body;
    expect(overview.subscription).toMatchObject({ onTrial: false, packageName: 'Starter' });
    expect(overview.invoices[0].amount).toBe(1180);
  });

  it('cannot be approved or rejected a second time', async () => {
    expect((await post(su.token, `/api/billing-admin/orders/${o._id}/approve`, { received: 1180 })).status).toBe(409);
    expect((await post(su.token, `/api/billing-admin/orders/${o._id}/reject`, { reason: 'late' })).status).toBe(409);
    expect(await TenantSubscriptionInvoice.countDocuments({ tenantId: t.tenant._id })).toBe(1);
  });
});

describe('renewing and switching', () => {
  const buy = async (pkg, periods) => {
    const created = (await order(t.adminToken, pkg._id, periods ? { periods } : {})).body;
    await post(t.adminToken, `/api/billing/orders/${created._id}/submit`, { utr: utr() });
    return created;
  };

  it('paying for the same package again extends from the current end date', async () => {
    const before = (await Tenant.findById(t.tenant._id)).planEndsAt;
    const created = await buy(starter);
    expect(created.kind).toBe('renewal');
    await post(su.token, `/api/billing-admin/orders/${created._id}/approve`, { received: created.total });
    const after = (await Tenant.findById(t.tenant._id)).planEndsAt;
    const added = (after - before) / day;
    expect(added).toBeGreaterThan(27);
    expect(added).toBeLessThan(32);
  });

  it('switching to a bigger package brings its limits, starts a fresh period, and says what the switch gives up', async () => {
    const created = await order(t.adminToken, pro._id);
    expect(created.body.kind).toBe('change');
    expect(created.body.losesDays).toBeGreaterThan(30);
    await post(t.adminToken, `/api/billing/orders/${created.body._id}/submit`, { utr: utr() });
    await post(su.token, `/api/billing-admin/orders/${created.body._id}/approve`, { received: created.body.total });
    const tenant = await Tenant.findById(t.tenant._id);
    expect(tenant).toMatchObject({ packageName: 'Pro', maxBranches: 5 });
    expect(tenant.maxMembers).toBeUndefined(); // Pro has no member cap
    expect((tenant.planEndsAt - Date.now()) / day).toBeLessThan(32); // a new month from today, not stacked on the old
  });

  it('a lapsed plan restarts from today, not from its old end', async () => {
    await Tenant.updateOne({ _id: t.tenant._id }, { planEndsAt: new Date(Date.now() - 10 * day) });
    const created = await buy(pro);
    await post(su.token, `/api/billing-admin/orders/${created._id}/approve`, { received: created.total });
    const days = ((await Tenant.findById(t.tenant._id)).planEndsAt - Date.now()) / day;
    expect(days).toBeGreaterThan(27);
    expect(days).toBeLessThan(32);
  });
});

describe('rejecting', () => {
  it('needs a reason, frees the transaction number, and lets the owner try again', async () => {
    const created = (await order(t.adminToken, pro._id)).body;
    const number = utr();
    await post(t.adminToken, `/api/billing/orders/${created._id}/submit`, { utr: number });
    expect((await post(su.token, `/api/billing-admin/orders/${created._id}/reject`, {})).status).toBe(400);
    const res = await post(su.token, `/api/billing-admin/orders/${created._id}/reject`, { reason: 'Amount did not arrive' });
    expect(res.body).toMatchObject({ status: 'rejected', rejectReason: 'Amount did not arrive' });
    const again = (await order(t.adminToken, pro._id)).body; // not blocked: nothing is waiting any more
    expect((await post(t.adminToken, `/api/billing/orders/${again._id}/submit`, { utr: number })).status).toBe(200);
  });
});

describe('a gym whose trial has ended can still pay to get out of it', () => {
  it('is read-only everywhere else, but billing works', async () => {
    await Tenant.updateOne({ _id: other.tenant._id }, { billingPlan: 'trial', trialEndsAt: new Date(Date.now() - day), planEndsAt: null });
    await SubscriptionOrder.deleteMany({ tenantId: other.tenant._id });
    const blocked = await post(other.adminToken, '/api/branches', { name: 'Blocked' });
    expect(blocked.status).toBe(402);
    const res = await order(other.adminToken, starter._id);
    expect(res.status).toBe(201);
    expect((await post(other.adminToken, `/api/billing/orders/${res.body._id}/submit`, { utr: utr() })).status).toBe(200);
    // the scoped platform admin manages this gym, so confirms it, and the gym is unlocked
    const approved = await post(paToken, `/api/billing-admin/orders/${res.body._id}/approve`, { received: res.body.total });
    expect(approved.status).toBe(200);
    expect((await post(other.adminToken, '/api/branches', { name: 'Unlocked' })).status).not.toBe(402);
  });
});

describe('the platform revenue figure', () => {
  it('counts confirmed payments', async () => {
    const res = await get(su.token, '/api/dashboard/summary');
    expect(res.status).toBe(200);
    expect(res.body.mrr).toBeGreaterThanOrEqual(1180);
  });
});
