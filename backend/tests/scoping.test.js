const { app, request, connect, disconnect, seedTenant, createMember, auth } = require('./helpers');
const Member = require('../models/Member');
const Branch = require('../models/Branch');

let a, b;

beforeAll(async () => {
  await connect();
  a = await seedTenant('tenant-a');
  b = await seedTenant('tenant-b');
}, 60000);
afterAll(disconnect);

describe('cross-tenant isolation', () => {
  it("hides tenant B's members from tenant A's list", async () => {
    await createMember(b.adminToken, { branchId: b.branch._id.toString(), planId: b.plan._id.toString(), name: 'B Member', phone: '9222222222' });
    const res = await request(app).get('/api/members').set(auth(a.adminToken));
    expect(res.status).toBe(200);
    expect(res.body.members.some((m) => m.name === 'B Member')).toBe(false);
  });

  it("blocks reading tenant B's member by direct id", async () => {
    const bMember = await createMember(b.adminToken, { branchId: b.branch._id.toString(), planId: b.plan._id.toString(), phone: '9222222223' });
    const res = await request(app).get(`/api/members/${bMember._id}`).set(auth(a.adminToken));
    expect(res.status).toBe(404);
  });

  it("blocks updating tenant B's member", async () => {
    const bMember = await createMember(b.adminToken, { branchId: b.branch._id.toString(), planId: b.plan._id.toString(), phone: '9222222224' });
    const res = await request(app).put(`/api/members/${bMember._id}`).set(auth(a.adminToken)).send({ name: 'Hijacked' });
    expect(res.status).toBe(404);
  });

  it("hides tenant B's plans from tenant A", async () => {
    const res = await request(app).get('/api/membership-plans').set(auth(a.adminToken));
    expect(res.body.some((p) => p._id === b.plan._id.toString())).toBe(false);
  });

  it("blocks renewing tenant B's member from tenant A", async () => {
    const bMember = await createMember(b.adminToken, { branchId: b.branch._id.toString(), planId: b.plan._id.toString(), phone: '9222222225' });
    const res = await request(app).post(`/api/members/${bMember._id}/renew`).set(auth(a.adminToken))
      .send({ membershipPlanId: a.plan._id.toString(), amount: 100 });
    expect(res.status).toBe(404);
  });
});

describe('enforceWriteScope', () => {
  it("ignores a foreign tenantId/branchId smuggled into a member create", async () => {
    const res = await request(app).post('/api/members').set(auth(a.managerToken)).send({
      name: 'Injected', phone: '9333333333',
      tenantId: b.tenant._id.toString(),
      branchId: b.branch._id.toString(),
    });
    expect(res.status).toBe(201);
    const saved = await Member.findById(res.body._id);
    expect(saved.tenantId.toString()).toBe(a.tenant._id.toString());
    expect(saved.branchId.toString()).toBe(a.branch._id.toString());
  });

  it("stamps a branch-manager's own branch even when another branch is claimed", async () => {
    const otherBranch = await Branch.create({ tenantId: a.tenant._id, name: 'Second branch' });
    const res = await request(app).post('/api/members').set(auth(a.managerToken))
      .send({ name: 'Branch hop', phone: '9333333334', branchId: otherBranch._id.toString() });
    expect(res.status).toBe(201);
    const saved = await Member.findById(res.body._id);
    expect(saved.branchId.toString()).toBe(a.branch._id.toString());
  });
});

describe('branch scoping within a tenant', () => {
  it("keeps a branch-manager from seeing another branch's members", async () => {
    const otherBranch = await Branch.create({ tenantId: a.tenant._id, name: 'Far branch' });
    await Member.create({
      tenantId: a.tenant._id, branchId: otherBranch._id, memberCode: 'GYM-FAR1',
      name: 'Far Member', phone: '9444444444', password: 'x', qrCode: 'qr-far-1',
    });
    const res = await request(app).get('/api/members').set(auth(a.managerToken));
    expect(res.body.members.some((m) => m.name === 'Far Member')).toBe(false);
    // ...but the tenant-admin, who spans branches, does see them.
    const adminRes = await request(app).get('/api/members').set(auth(a.adminToken));
    expect(adminRes.body.members.some((m) => m.name === 'Far Member')).toBe(true);
  });
});
