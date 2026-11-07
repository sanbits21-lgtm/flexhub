const { app, request, connect, disconnect, seedTenant, createMember, auth } = require('./helpers');

let A; let B; let ana; let bob;
const list = (token, query = '') => request(app).get(`/api/payments${query}`).set(auth(token));
const pay = (t, body) => request(app).post('/api/payments').set(auth(t.managerToken)).send({ membershipPlanId: t.plan._id.toString(), method: 'cash', status: 'paid', ...body });

beforeAll(async () => {
  await connect();
  A = await seedTenant('pay-a');
  B = await seedTenant('pay-b');
  const mk = (t, name, phone) => createMember(t.managerToken, { branchId: t.branch._id.toString(), planId: t.plan._id.toString(), name, phone });
  ana = await mk(A, 'Ana Rao', '9810000001');
  bob = await mk(A, 'Bob Lee', '9810000002');
  const other = await mk(B, 'Ana Other Gym', '9810000003');
  await pay(A, { memberId: ana._id, amount: 1000 });
  await pay(A, { memberId: ana._id, amount: 2500, method: 'upi' });
  await pay(A, { memberId: bob._id, amount: 700, status: 'pending', method: 'upi' });
  const toRefund = (await pay(A, { memberId: bob._id, amount: 300 })).body;
  await request(app).put(`/api/payments/${toRefund._id}`).set(auth(A.managerToken)).send({ status: 'refunded' });
  await pay(B, { memberId: other._id, amount: 99999 });
}, 120000);
afterAll(disconnect);

describe('payments list totals', () => {
  it('adds up each status over everything that matches, not just the page', async () => {
    const res = await list(A.adminToken, '?page=1&limit=1');
    expect(res.status).toBe(200);
    expect(res.body.payments).toHaveLength(1);
    expect(res.body.total).toBe(4);
    expect(res.body.summary).toEqual({
      paid: { amount: 3500, count: 2 },
      pending: { amount: 700, count: 1 },
      refunded: { amount: 300, count: 1 },
      failed: { amount: 0, count: 0 },
    });
  });

  it('follows the filters', async () => {
    const upi = await list(A.adminToken, '?method=upi');
    expect(upi.body.summary.paid).toEqual({ amount: 2500, count: 1 });
    expect(upi.body.summary.pending).toEqual({ amount: 700, count: 1 });
    const pending = await list(A.adminToken, '?status=pending');
    expect(pending.body.total).toBe(1);
    expect(pending.body.summary.paid).toEqual({ amount: 0, count: 0 });
  });

  it("never includes another gym's money", async () => {
    const res = await list(B.adminToken);
    expect(res.body.summary.paid).toEqual({ amount: 99999, count: 1 });
    expect(res.body.total).toBe(1);
  });
});

describe('payments search', () => {
  it("finds payments by the member's name, case-insensitively, within this gym only", async () => {
    const res = await list(A.adminToken, '?search=ana');
    expect(res.body.total).toBe(2);
    expect(res.body.payments.every((p) => p.memberId.name === 'Ana Rao')).toBe(true);
    expect(res.body.summary.paid.amount).toBe(3500);
  });

  it('finds a payment by invoice number', async () => {
    const one = (await list(A.adminToken, '?status=pending')).body.payments[0];
    const res = await list(A.adminToken, `?search=${encodeURIComponent(one.invoiceNumber.slice(0, 8))}`);
    expect(res.body.payments.map((p) => p._id)).toContain(one._id);
  });

  it('combines with filters, and treats special characters as text', async () => {
    expect((await list(A.adminToken, '?search=bob&status=pending')).body.total).toBe(1);
    expect((await list(A.adminToken, '?search=bob&status=paid')).body.total).toBe(0);
    const weird = await list(A.adminToken, `?search=${encodeURIComponent('.*(')}`);
    expect(weird.status).toBe(200);
    expect(weird.body.total).toBe(0);
  });
});
