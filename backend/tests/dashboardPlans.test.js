const { app, request, connect, disconnect, seedTenant, auth, uniq } = require('./helpers');
const Branch = require('../models/Branch');
const Member = require('../models/Member');
const MembershipPlan = require('../models/MembershipPlan');
const MemberPayment = require('../models/MemberPayment');

// "Plans trending" on the owner's dashboard: which membership plans are selling, this month against last.

let t; let other; let north; let holder; let otherHolder;
let gold; let monthly; let yearly; let quarterly;
const day = 86400000;

// Mid-month, so a time zone cannot push a payment into the neighbouring month.
const inMonth = (offset) => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + offset, 10, 12, 0, 0); };
const plan = (tenant, name, price) => MembershipPlan.create({ tenantId: tenant._id, name, durationUnit: 'monthly', price });
const member = (tenant, branch, planId, name, phone) => Member.create({
  tenantId: tenant._id, branchId: branch._id, name, phone, memberCode: uniq('MC'), qrCode: uniq('QR'), password: 'Sup3r-secret-pass',
  membershipPlanId: planId, membershipStatus: 'active', membershipEnd: new Date(Date.now() + 30 * day),
});
const pay = (tenant, branch, who, planId, offset, extra = {}) => MemberPayment.create({
  tenantId: tenant._id, branchId: branch._id, memberId: who._id, membershipPlanId: planId, amount: 1000, method: 'cash', status: 'paid',
  paidAt: inMonth(offset), invoiceNumber: uniq('INV'), ...extra,
});
const trending = async (token, query = '') => (await request(app).get(`/api/dashboard/summary${query}`).set(auth(token))).body.plansTrending;

beforeAll(async () => {
  await connect();
  t = await seedTenant('pt');
  other = await seedTenant('ptother');
  north = await Branch.create({ tenantId: t.tenant._id, name: 'North' });
  monthly = t.plan;
  await MembershipPlan.updateOne({ _id: monthly._id }, { name: 'Monthly' });
  gold = await plan(t.tenant, 'Gold', 2500);
  yearly = await plan(t.tenant, 'Yearly', 9000);
  quarterly = await plan(t.tenant, 'Quarterly', 2700);
  await plan(t.tenant, 'Ghost', 1); // no sales and no members: should never appear
  holder = await member(t.tenant, t.branch, monthly._id, 'Holder', '9830000001');
  await member(t.tenant, t.branch, quarterly._id, 'On quarterly', '9830000002'); // a member, but no sale in six months
  otherHolder = await member(other.tenant, other.branch, other.plan._id, 'Other holder', '9830000003');

  // Gold: 3 sales this month (2 main, 1 north), 1 last month
  await pay(t.tenant, t.branch, holder, gold._id, 0, { amount: 2500 });
  await pay(t.tenant, t.branch, holder, gold._id, 0, { amount: 2500 });
  await pay(t.tenant, north, holder, gold._id, 0, { amount: 2500 });
  await pay(t.tenant, t.branch, holder, gold._id, -1, { amount: 2500 });
  // Monthly: 1 this month, 2 last month, plus payments that are not sales
  await pay(t.tenant, t.branch, holder, monthly._id, 0);
  await pay(t.tenant, t.branch, holder, monthly._id, -1);
  await pay(t.tenant, t.branch, holder, monthly._id, -1);
  await pay(t.tenant, t.branch, holder, monthly._id, 0, { status: 'pending' });
  await pay(t.tenant, t.branch, holder, monthly._id, 0, { status: 'failed' });
  await pay(t.tenant, t.branch, holder, monthly._id, 0, { status: 'refunded' });
  await pay(t.tenant, t.branch, holder, undefined, 0); // a payment with no plan
  // Yearly: 2 this month, none last month: a new seller
  await pay(t.tenant, t.branch, holder, yearly._id, 0, { amount: 9000 });
  await pay(t.tenant, t.branch, holder, yearly._id, 0, { amount: 9000 });
  // Another gym's sales must never show here
  await pay(other.tenant, other.branch, otherHolder, other.plan._id, 0);
}, 120000);
afterAll(disconnect);

describe('plans trending', () => {
  it('ranks plans by sales this month, with last month beside it', async () => {
    const rows = await trending(t.adminToken);
    expect(rows.map((r) => r.name)).toEqual(['Gold', 'Yearly', 'Monthly', 'Quarterly']);
    const by = Object.fromEntries(rows.map((r) => [r.name, r]));
    expect(by.Gold).toMatchObject({ thisMonth: 3, lastMonth: 1, change: 200, isNew: false, revenueThisMonth: 7500 });
    expect(by.Monthly).toMatchObject({ thisMonth: 1, lastMonth: 2, change: -50, isNew: false });
  });

  it('calls a plan with sales this month and none last month "new", not an infinite increase', async () => {
    const yearlyRow = (await trending(t.adminToken)).find((r) => r.name === 'Yearly');
    expect(yearlyRow).toMatchObject({ thisMonth: 2, lastMonth: 0, change: null, isNew: true, revenueThisMonth: 18000 });
  });

  it('keeps a plan that members are on but that sold nothing, and drops one with no activity at all', async () => {
    const rows = await trending(t.adminToken);
    expect(rows.find((r) => r.name === 'Quarterly')).toMatchObject({ thisMonth: 0, activeMembers: 1, change: null, isNew: false });
    expect(rows.some((r) => r.name === 'Ghost')).toBe(false);
  });

  it('counts only paid sales of a plan: not pending, failed, refunded, or planless payments', async () => {
    const monthlyRow = (await trending(t.adminToken)).find((r) => r.name === 'Monthly');
    expect(monthlyRow.thisMonth).toBe(1);
    expect(monthlyRow.lastMonth).toBe(2);
  });

  it('gives six months of sales for the little trend line, ending with this month', async () => {
    const gold_ = (await trending(t.adminToken)).find((r) => r.name === 'Gold');
    expect(gold_.series).toHaveLength(6);
    expect(gold_.series[5]).toBe(3);
    expect(gold_.series[4]).toBe(1);
    expect(gold_.series.slice(0, 4)).toEqual([0, 0, 0, 0]);
  });

  it('shows how many active members are on each plan today', async () => {
    const rows = await trending(t.adminToken);
    expect(rows.find((r) => r.name === 'Monthly').activeMembers).toBe(1);
    expect(rows.find((r) => r.name === 'Gold').activeMembers).toBe(0);
  });

  it('narrows to one branch when the owner drills into it', async () => {
    const rows = await trending(t.adminToken, `?branchId=${north._id}`);
    expect(rows.map((r) => r.name)).toEqual(['Gold']);
    expect(rows[0].thisMonth).toBe(1);
  });

  it("never includes another gym's plans or sales, and a quiet gym gets an empty list", async () => {
    const mine = await trending(t.adminToken);
    expect(mine.some((r) => /Other|Monthly/.test(r.name) && r.thisMonth > 1 && r.name !== 'Monthly')).toBe(false);
    const theirs = await trending(other.adminToken);
    expect(theirs).toHaveLength(1);
    expect(theirs[0]).toMatchObject({ thisMonth: 1 });
    const empty = await seedTenant('ptempty');
    expect(await trending(empty.adminToken)).toEqual([]);
  });

  it('shows the five best sellers at most', async () => {
    const busy = await seedTenant('ptbusy');
    const who = await member(busy.tenant, busy.branch, busy.plan._id, 'Busy holder', '9830000009');
    for (let i = 1; i <= 7; i += 1) {
      const p = await plan(busy.tenant, `Plan ${i}`, 100 * i);
      for (let n = 0; n < i; n += 1) await pay(busy.tenant, busy.branch, who, p._id, 0);
    }
    const rows = await trending(busy.adminToken);
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.thisMonth)).toEqual([7, 6, 5, 4, 3]);
  });
});
