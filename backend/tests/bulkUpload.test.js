const { app, request, connect, disconnect, seedTenant, createSuperAdmin, auth, uniq } = require('./helpers');
const MemberPayment = require('../models/MemberPayment');
const Member = require('../models/Member');

let t;
const branchId = () => t.branch._id.toString();
const planId = () => t.plan._id.toString();

beforeAll(async () => {
  await connect();
  t = await seedTenant('bulk');
}, 60000);
afterAll(disconnect);

const bulkCreate = (members, token = t.managerToken) =>
  request(app).post('/api/members/bulk').set(auth(token)).send({ branchId: branchId(), members });

describe('bulk upload — plan resolution and payment recording', () => {
  it('records a payment at the plan price when a row carries its own plan', async () => {
    const res = await bulkCreate([{ name: 'Row Plan Member', phone: uniq('p'), membershipPlanId: planId() }]);
    expect(res.status).toBe(201);
    expect(res.body.succeeded).toBe(1);
    expect(res.body.paymentsRecorded).toBe(1);

    const member = await Member.findById(res.body.results[0].memberId);
    const payment = await MemberPayment.findOne({ memberId: member._id });
    expect(payment.amount).toBe(t.plan.price);
    expect(payment.method).toBe('cash');
    expect(payment.status).toBe('paid');
    expect(payment.membershipPlanId.toString()).toBe(planId());
  });

  it('records no payment and no plan for a member with neither a row plan nor a batch plan', async () => {
    const res = await bulkCreate([{ name: 'No Plan Member', phone: uniq('p') }]);
    expect(res.status).toBe(201);
    expect(res.body.paymentsRecorded).toBe(0);

    const member = await Member.findById(res.body.results[0].memberId);
    expect(member.membershipPlanId).toBeFalsy();
    expect(await MemberPayment.countDocuments({ memberId: member._id })).toBe(0);
  });

  it('still allows a mix of some rows with a plan and some without in one batch', async () => {
    const res = await bulkCreate([
      { name: 'Mixed With Plan', phone: uniq('p'), membershipPlanId: planId() },
      { name: 'Mixed Without Plan', phone: uniq('p') },
    ]);
    expect(res.status).toBe(201);
    expect(res.body.succeeded).toBe(2);
    expect(res.body.paymentsRecorded).toBe(1);
  });

  it('a row-level plan that fails server-side validation still fails that row only', async () => {
    // Simulates a stale/tampered client sending an id that isn't a real plan for this
    // tenant — should fail just that row with a clear message, not the whole batch.
    const res = await bulkCreate([
      { name: 'Bad Plan Id', phone: uniq('p'), membershipPlanId: '000000000000000000000000' },
      { name: 'Good Row', phone: uniq('p') },
    ]);
    expect(res.status).toBe(201);
    expect(res.body.succeeded).toBe(1);
    expect(res.body.failed).toBe(1);
    expect(res.body.results.find((r) => !r.success).error).toMatch(/plan/i);
  });

  it('audit log records paymentsRecorded in metadata', async () => {
    const superAdmin = await createSuperAdmin();
    await bulkCreate([{ name: 'Audited Member', phone: uniq('p'), membershipPlanId: planId() }]);

    const logs = await request(app).get('/api/audit-logs?limit=10').set(auth(superAdmin.token));
    const entry = logs.body.logs.find((l) => l.action === 'BULK_CREATE_MEMBERS' && l.metadata?.paymentsRecorded === 1);
    expect(entry).toBeTruthy();
  });
});
