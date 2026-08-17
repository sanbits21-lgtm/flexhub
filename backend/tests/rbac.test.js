const { app, request, connect, disconnect, seedTenant, createSuperAdmin, auth } = require('./helpers');

let t, superAdmin;

beforeAll(async () => {
  await connect();
  t = await seedTenant('rbac');
  superAdmin = await createSuperAdmin();
}, 60000);
afterAll(disconnect);

describe('authentication', () => {
  it('rejects a bad password', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: t.admin.email, password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  it('rejects a request with no token', async () => {
    expect((await request(app).get('/api/members')).status).toBe(401);
  });

  it('rejects a garbage token', async () => {
    const res = await request(app).get('/api/members').set(auth('not-a-real-token'));
    expect(res.status).toBe(401);
  });

  it('returns the current user for a valid token', async () => {
    const res = await request(app).get('/api/auth/me').set(auth(t.adminToken));
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('tenant-admin');
  });
});

describe('role guards', () => {
  it('blocks a trainer from creating members', async () => {
    const res = await request(app).post('/api/members').set(auth(t.trainerToken))
      .send({ name: 'X', phone: '9', branchId: t.branch._id.toString() });
    expect(res.status).toBe(403);
  });

  it('blocks a branch-manager from creating membership plans', async () => {
    const res = await request(app).post('/api/membership-plans').set(auth(t.managerToken))
      .send({ name: 'Sneaky', durationUnit: 'monthly', price: 1 });
    expect(res.status).toBe(403);
  });

  it('blocks a tenant-admin from the platform-admin endpoints', async () => {
    expect((await request(app).get('/api/platform-admins').set(auth(t.adminToken))).status).toBe(403);
  });

  it('blocks a tenant-admin from the audit log', async () => {
    expect((await request(app).get('/api/audit-logs').set(auth(t.adminToken))).status).toBe(403);
  });

  it('allows a super-admin into the audit log', async () => {
    expect((await request(app).get('/api/audit-logs').set(auth(superAdmin.token))).status).toBe(200);
  });

  it('blocks a branch-manager from the tenant reports', async () => {
    expect((await request(app).get('/api/reports/summary').set(auth(t.managerToken))).status).toBe(403);
  });

  it('lets a branch-manager read plans but not write them', async () => {
    expect((await request(app).get('/api/membership-plans').set(auth(t.managerToken))).status).toBe(200);
    const res = await request(app).put(`/api/membership-plans/${t.plan._id}`).set(auth(t.managerToken)).send({ price: 1 });
    expect(res.status).toBe(403);
  });
});

describe('attendance guards', () => {
  it('blocks a super-admin (no branch context) from recording attendance', async () => {
    const res = await request(app).post('/api/attendance/check-in').set(auth(superAdmin.token)).send({ memberId: t.branch._id.toString() });
    expect(res.status).toBe(403);
  });

  it('tells a tenant-admin to pick a branch rather than crashing', async () => {
    const res = await request(app).post('/api/attendance/check-in').set(auth(t.adminToken)).send({ memberId: t.branch._id.toString() });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/branch/i);
  });
});

describe('request validation', () => {
  it('rejects a member with no name and reports the field', async () => {
    const res = await request(app).post('/api/members').set(auth(t.managerToken)).send({ phone: '9' });
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e) => e.field)).toContain('name');
  });

  it('rejects an invalid payment method instead of 500ing', async () => {
    const res = await request(app).post('/api/payments').set(auth(t.managerToken))
      .send({ memberId: t.branch._id.toString(), amount: 100, method: 'bitcoin' });
    expect(res.status).toBe(400);
  });

  it('rejects a negative payment amount', async () => {
    const res = await request(app).post('/api/payments').set(auth(t.managerToken))
      .send({ memberId: t.branch._id.toString(), amount: -100 });
    expect(res.status).toBe(400);
  });

  it('rejects a malformed login body', async () => {
    expect((await request(app).post('/api/auth/login').send({ email: 'not-an-email' })).status).toBe(400);
  });
});
