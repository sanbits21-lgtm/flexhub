const { app, request, connect, disconnect, seedTenant, createMember, auth } = require('./helpers');
const Member = require('../models/Member');
const MembershipPlan = require('../models/MembershipPlan');

let t, member;
const branchId = () => t.branch._id.toString();
const planId = () => t.plan._id.toString();

beforeAll(async () => {
  await connect();
  t = await seedTenant('payments');
  member = await createMember(t.managerToken, { branchId: branchId(), planId: planId(), phone: '9600000001' });
}, 60000);
afterAll(disconnect);

const recordPayment = (body, token = t.managerToken) =>
  request(app).post('/api/payments').set(auth(token)).send({ memberId: member._id, membershipPlanId: planId(), ...body });

describe('recording payments', () => {
  it('stamps paidAt and an invoice number on a paid payment', async () => {
    const res = await recordPayment({ amount: 1000, method: 'cash', status: 'paid' });
    expect(res.status).toBe(201);
    expect(res.body.invoiceNumber).toMatch(/^INV-/);
    expect(res.body.paidAt).toBeTruthy();
  });

  it('leaves paidAt empty on a pending payment', async () => {
    const res = await recordPayment({ amount: 500, method: 'upi', status: 'pending' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
    expect(res.body.paidAt).toBeFalsy();
  });

  it('issues unique invoice numbers under rapid succession', async () => {
    const results = await Promise.all([
      recordPayment({ amount: 1, method: 'cash' }),
      recordPayment({ amount: 2, method: 'cash' }),
      recordPayment({ amount: 3, method: 'cash' }),
      recordPayment({ amount: 4, method: 'cash' }),
    ]);
    const invoices = results.map((r) => r.body.invoiceNumber);
    expect(new Set(invoices).size).toBe(invoices.length);
  });
});

describe('settling and refunding', () => {
  it('marks a pending payment paid and stamps paidAt', async () => {
    const pending = await recordPayment({ amount: 700, method: 'upi', status: 'pending' });
    const res = await request(app).put(`/api/payments/${pending.body._id}`).set(auth(t.managerToken)).send({ status: 'paid' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('paid');
    expect(res.body.paidAt).toBeTruthy();
  });

  it('clears paidAt on refund so it stops counting as revenue', async () => {
    const paid = await recordPayment({ amount: 900, method: 'cash', status: 'paid' });
    const res = await request(app).put(`/api/payments/${paid.body._id}`).set(auth(t.managerToken)).send({ status: 'refunded' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('refunded');
    expect(res.body.paidAt).toBeNull();
  });

  it('lets a tenant-admin refund too, not just a branch-manager', async () => {
    const paid = await recordPayment({ amount: 250, method: 'cash', status: 'paid' });
    const res = await request(app).put(`/api/payments/${paid.body._id}`).set(auth(t.adminToken)).send({ status: 'refunded' });
    expect(res.status).toBe(200);
  });

  it('rejects an unknown status', async () => {
    const paid = await recordPayment({ amount: 100, method: 'cash', status: 'paid' });
    const res = await request(app).put(`/api/payments/${paid.body._id}`).set(auth(t.managerToken)).send({ status: 'vanished' });
    expect(res.status).toBe(400);
  });
});

describe('listing payments', () => {
  it('filters by status', async () => {
    const res = await request(app).get('/api/payments?status=pending&limit=100').set(auth(t.managerToken));
    expect(res.status).toBe(200);
    expect(res.body.payments.every((p) => p.status === 'pending')).toBe(true);
  });

  it('filters by method', async () => {
    const res = await request(app).get('/api/payments?method=upi&limit=100').set(auth(t.managerToken));
    expect(res.body.payments.every((p) => p.method === 'upi')).toBe(true);
  });

  it('excludes payments outside the date range', async () => {
    const res = await request(app).get('/api/payments?from=2000-01-01&to=2000-01-02').set(auth(t.managerToken));
    expect(res.body.payments).toHaveLength(0);
  });

  it('includes payments made today when today is the range', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await request(app).get(`/api/payments?from=${today}&to=${today}&limit=100`).set(auth(t.managerToken));
    expect(res.body.payments.length).toBeGreaterThan(0);
  });

  it('paginates', async () => {
    const res = await request(app).get('/api/payments?page=1&limit=2').set(auth(t.managerToken));
    expect(res.body.payments.length).toBeLessThanOrEqual(2);
    expect(res.body.total).toBeGreaterThan(2);
    expect(res.body.page).toBe(1);
  });
});

describe('renewal', () => {
  it('doubles as "add a first plan" for a member created with no plan at all', async () => {
    // frontend/src/components/RenewMembershipModal.jsx relabels itself "Add Plan" for
    // exactly this case — the backend needed no change, since a member with no plan has
    // no membershipEnd, and the existing "lapsed restarts from today" rule already does
    // the right thing when there's nothing to extend from.
    const noPlanMember = await createMember(t.managerToken, { branchId: branchId(), phone: '9600000099' });
    expect(noPlanMember.membershipPlanId).toBeFalsy();

    const res = await request(app).post(`/api/members/${noPlanMember._id}/renew`).set(auth(t.managerToken))
      .send({ membershipPlanId: planId(), amount: 1000, method: 'cash' });

    expect(res.status).toBe(200);
    expect(res.body.member.membershipPlanId).toBe(planId());
    expect(res.body.member.membershipStatus).toBe('active');
    expect(new Date(res.body.member.membershipStart).toDateString()).toBe(new Date().toDateString());
    expect(res.body.payment.status).toBe('paid');
  });

  it('restarts a lapsed membership from today and records the payment', async () => {
    const lapsed = await createMember(t.managerToken, { branchId: branchId(), planId: planId(), phone: '9600000002' });
    await Member.updateOne({ _id: lapsed._id }, { membershipEnd: new Date(Date.now() - 20 * 24 * 3600 * 1000) });

    const res = await request(app).post(`/api/members/${lapsed._id}/renew`).set(auth(t.managerToken))
      .send({ membershipPlanId: planId(), amount: 900, method: 'upi' });

    expect(res.status).toBe(200);
    expect(res.body.member.membershipStatus).toBe('active');
    expect(new Date(res.body.member.membershipStart).toDateString()).toBe(new Date().toDateString());
    expect(res.body.payment.amount).toBe(900);
    expect(res.body.payment.status).toBe('paid');
  });

  it('extends from the existing expiry when renewing early', async () => {
    const active = await createMember(t.managerToken, { branchId: branchId(), planId: planId(), phone: '9600000003' });
    const currentEnd = new Date(active.membershipEnd);

    const res = await request(app).post(`/api/members/${active._id}/renew`).set(auth(t.managerToken))
      .send({ membershipPlanId: planId(), amount: 1000, method: 'cash' });

    expect(res.status).toBe(200);
    // New term starts where the old one ended — unused days are not burned.
    expect(new Date(res.body.member.membershipStart).toISOString()).toBe(currentEnd.toISOString());
    const end = new Date(res.body.member.membershipEnd);
    expect(end.getTime()).toBeGreaterThan(currentEnd.getTime());
  });

  it('switching to a different plan starts today, discarding remaining time on the old plan', async () => {
    const otherPlan = await MembershipPlan.create({ tenantId: t.tenant._id, name: 'Quarterly', durationUnit: 'quarterly', price: 2500 });
    const active = await createMember(t.managerToken, { branchId: branchId(), planId: planId(), phone: '9600000006' });
    const originalEnd = new Date(active.membershipEnd);
    expect(originalEnd.getTime()).toBeGreaterThan(Date.now()); // plenty of time left

    const res = await request(app).post(`/api/members/${active._id}/renew`).set(auth(t.managerToken))
      .send({ membershipPlanId: otherPlan._id.toString(), amount: otherPlan.price, method: 'cash' });

    expect(res.status).toBe(200);
    expect(res.body.member.membershipPlanId).toBe(otherPlan._id.toString());
    // Started today, NOT from the old plan's remaining end date.
    expect(new Date(res.body.member.membershipStart).toDateString()).toBe(new Date().toDateString());
    expect(new Date(res.body.member.membershipStart).getTime()).toBeLessThan(originalEnd.getTime());
  });

  it('renewing onto the SAME plan still extends from the existing expiry, not today', async () => {
    const active = await createMember(t.managerToken, { branchId: branchId(), planId: planId(), phone: '9600000007' });
    const currentEnd = new Date(active.membershipEnd);

    const res = await request(app).post(`/api/members/${active._id}/renew`).set(auth(t.managerToken))
      .send({ membershipPlanId: planId(), amount: t.plan.price, method: 'cash' });

    expect(res.status).toBe(200);
    expect(new Date(res.body.member.membershipStart).toISOString()).toBe(currentEnd.toISOString());
  });

  it('falls back to the plan price when no amount is given', async () => {
    const m = await createMember(t.managerToken, { branchId: branchId(), planId: planId(), phone: '9600000004' });
    const res = await request(app).post(`/api/members/${m._id}/renew`).set(auth(t.managerToken)).send({ membershipPlanId: planId() });
    expect(res.body.payment.amount).toBe(t.plan.price);
  });

  it('refuses to renew onto a plan from another tenant', async () => {
    const other = await seedTenant('renew-other');
    const m = await createMember(t.managerToken, { branchId: branchId(), planId: planId(), phone: '9600000005' });
    const res = await request(app).post(`/api/members/${m._id}/renew`).set(auth(t.managerToken))
      .send({ membershipPlanId: other.plan._id.toString(), amount: 100 });
    expect(res.status).toBe(400);
  });
});
