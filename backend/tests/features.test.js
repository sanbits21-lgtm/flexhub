const { app, request, connect, disconnect, seedTenant, createMember, auth } = require('./helpers');

let t;
const branchId = () => t.branch._id.toString();
const planId = () => t.plan._id.toString();

beforeAll(async () => {
  await connect();
  t = await seedTenant('features');
}, 60000);
afterAll(disconnect);

describe('defaults — untouched tenant behaves exactly as before', () => {
  it('reports page and Payments page work with no flags ever set', async () => {
    expect((await request(app).get('/api/reports/summary').set(auth(t.adminToken))).status).toBe(200);
    expect((await request(app).get('/api/payments').set(auth(t.managerToken))).status).toBe(200);
  });
});

describe('Workspace endpoints — platform-admin only', () => {
  it('tenant-admin and branch-manager are both forbidden', async () => {
    expect((await request(app).get(`/api/tenants/${t.tenant._id}/features`).set(auth(t.adminToken))).status).toBe(403);
    expect((await request(app).put(`/api/tenants/${t.tenant._id}/features`).set(auth(t.managerToken)).send({ features: {} })).status).toBe(403);
  });

  it('super-admin can read the registry and resolved state', async () => {
    const super_ = await require('./helpers').createSuperAdmin();
    const res = await request(app).get(`/api/tenants/${t.tenant._id}/features`).set(auth(super_.token));
    expect(res.status).toBe(200);
    expect(res.body.resolved['pages:reports']).toBe(true);
    expect(res.body.registry['pages:reports'].label).toBe('Reports');
    expect(res.body.overrides).toEqual({});
  });

  it('rejects an unknown feature key', async () => {
    const super_ = await require('./helpers').createSuperAdmin();
    const res = await request(app).put(`/api/tenants/${t.tenant._id}/features`).set(auth(super_.token))
      .send({ features: { 'not.a.real.key': false } });
    expect(res.status).toBe(400);
  });
});

describe('a disabled route-level (Pattern A) feature blocks staff, not the platform', () => {
  let super_;
  beforeAll(async () => { super_ = await require('./helpers').createSuperAdmin(); });

  afterEach(async () => {
    // Reset so later describe blocks aren't affected by ordering.
    await request(app).put(`/api/tenants/${t.tenant._id}/features`).set(auth(super_.token))
      .send({ features: { 'pages:reports': true, 'pages:equipment': true, 'features:bulkUpload': true } });
  });

  it('blocks GET /api/reports/summary once pages.reports is off, restores when back on', async () => {
    await request(app).put(`/api/tenants/${t.tenant._id}/features`).set(auth(super_.token)).send({ features: { 'pages:reports': false } });
    const blocked = await request(app).get('/api/reports/summary').set(auth(t.adminToken));
    expect(blocked.status).toBe(403);
    expect(blocked.body.message).toMatch(/not enabled/i);

    await request(app).put(`/api/tenants/${t.tenant._id}/features`).set(auth(super_.token)).send({ features: { 'pages:reports': true } });
    expect((await request(app).get('/api/reports/summary').set(auth(t.adminToken))).status).toBe(200);
  });

  it('blocks the whole Equipment router once pages.equipment is off', async () => {
    await request(app).put(`/api/tenants/${t.tenant._id}/features`).set(auth(super_.token)).send({ features: { 'pages:equipment': false } });
    expect((await request(app).get('/api/equipment').set(auth(t.managerToken))).status).toBe(403);
  });

  it('blocks bulk upload but leaves plain member create working', async () => {
    await request(app).put(`/api/tenants/${t.tenant._id}/features`).set(auth(super_.token)).send({ features: { 'features:bulkUpload': false } });

    const bulkRes = await request(app).post('/api/members/bulk').set(auth(t.managerToken))
      .send({ branchId: branchId(), members: [{ name: 'X', phone: '9' }] });
    expect(bulkRes.status).toBe(403);

    const plainRes = await createMember(t.managerToken, { branchId: branchId(), planId: planId(), phone: '9700000001' });
    expect(plainRes._id).toBeTruthy();
  });
});

describe('a disabled inline (Pattern B) feature blocks one choice, not the whole endpoint', () => {
  let super_, member;
  beforeAll(async () => {
    super_ = await require('./helpers').createSuperAdmin();
    member = await createMember(t.managerToken, { branchId: branchId(), planId: planId(), phone: '9700000002' });
  });
  afterEach(async () => {
    await request(app).put(`/api/tenants/${t.tenant._id}/features`).set(auth(super_.token))
      .send({ features: { 'features:upiPayments': true, 'features:paymentRefunds': true, 'features:trainerAssignment': true } });
  });

  it('blocks method: upi on payment create while cash keeps working', async () => {
    await request(app).put(`/api/tenants/${t.tenant._id}/features`).set(auth(super_.token)).send({ features: { 'features:upiPayments': false } });

    const upiRes = await request(app).post('/api/payments').set(auth(t.managerToken))
      .send({ memberId: member._id, membershipPlanId: planId(), amount: 500, method: 'upi' });
    expect(upiRes.status).toBe(403);

    const cashRes = await request(app).post('/api/payments').set(auth(t.managerToken))
      .send({ memberId: member._id, membershipPlanId: planId(), amount: 500, method: 'cash' });
    expect(cashRes.status).toBe(201);
  });

  it('blocks UPI on renewal too, not just plain payment create', async () => {
    await request(app).put(`/api/tenants/${t.tenant._id}/features`).set(auth(super_.token)).send({ features: { 'features:upiPayments': false } });
    const res = await request(app).post(`/api/members/${member._id}/renew`).set(auth(t.managerToken))
      .send({ membershipPlanId: planId(), amount: 500, method: 'upi' });
    expect(res.status).toBe(403);
  });

  it('blocks refund while settling a pending payment to paid still works', async () => {
    const pending = await request(app).post('/api/payments').set(auth(t.managerToken))
      .send({ memberId: member._id, membershipPlanId: planId(), amount: 300, method: 'cash', status: 'pending' });
    const paid = await request(app).post('/api/payments').set(auth(t.managerToken))
      .send({ memberId: member._id, membershipPlanId: planId(), amount: 300, method: 'cash', status: 'paid' });

    await request(app).put(`/api/tenants/${t.tenant._id}/features`).set(auth(super_.token)).send({ features: { 'features:paymentRefunds': false } });

    const refundRes = await request(app).put(`/api/payments/${paid.body._id}`).set(auth(t.managerToken)).send({ status: 'refunded' });
    expect(refundRes.status).toBe(403);

    const settleRes = await request(app).put(`/api/payments/${pending.body._id}`).set(auth(t.managerToken)).send({ status: 'paid' });
    expect(settleRes.status).toBe(200);
  });

  it('silently drops assignedTrainerId on create rather than erroring when the feature is off', async () => {
    await request(app).put(`/api/tenants/${t.tenant._id}/features`).set(auth(super_.token)).send({ features: { 'features:trainerAssignment': false } });
    const res = await request(app).post('/api/members').set(auth(t.managerToken))
      .send({ name: 'No Trainer', phone: '9700000003', branchId: branchId(), assignedTrainerId: t.trainer._id.toString() });
    expect(res.status).toBe(201);
    expect(res.body.assignedTrainerId).toBeFalsy();
  });
});

describe('feature-gated response shape', () => {
  it('login and /me include resolved features for a tenant-scoped role', async () => {
    const res = await request(app).get('/api/auth/me').set(auth(t.managerToken));
    expect(res.body.features).toBeDefined();
    expect(res.body.features['pages:reports']).toBe(true);
  });

  it('super-admin gets no features object — never gated', async () => {
    const super_ = await require('./helpers').createSuperAdmin();
    const res = await request(app).get('/api/auth/me').set(auth(super_.token));
    expect(res.body.features).toBeUndefined();
  });
});

describe('audit trail', () => {
  it('records only the keys that actually changed, with from/to', async () => {
    const super_ = await require('./helpers').createSuperAdmin();
    // Baseline PUT (no-op value, same as default) then a real flip — only the second
    // should show up as "changed" if the diff is computed correctly.
    await request(app).put(`/api/tenants/${t.tenant._id}/features`).set(auth(super_.token)).send({ features: { 'pages:equipment': true } });
    const res = await request(app).put(`/api/tenants/${t.tenant._id}/features`).set(auth(super_.token)).send({ features: { 'pages:equipment': false } });
    expect(res.status).toBe(200);
    expect(res.body.resolved['pages:equipment']).toBe(false);

    const logs = await request(app).get('/api/audit-logs?limit=5').set(auth(super_.token));
    const entry = logs.body.logs.find((l) => l.action === 'UPDATE_TENANT_FEATURES');
    expect(entry).toBeTruthy();
    expect(entry.metadata.changed['pages:equipment']).toEqual({ from: true, to: false });

    await request(app).put(`/api/tenants/${t.tenant._id}/features`).set(auth(super_.token)).send({ features: { 'pages:equipment': true } });
  });
});
