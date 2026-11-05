const { app, request, connect, disconnect, seedTenant, createMember, auth } = require('./helpers');
const Member = require('../models/Member');

// Regression tests for problems found by walking the tenant-admin screens by hand.

let t;
const day = 86400000;

beforeAll(async () => {
  await connect();
  t = await seedTenant('fix');
  const mk = (name, phone) => createMember(t.managerToken, { branchId: t.branch._id.toString(), planId: t.plan._id.toString(), name, phone });
  const live = await mk('Live Member', '9700100001');
  const lapsed = await mk('Lapsed Member', '9700100002');
  await Member.updateOne({ _id: live._id }, { membershipEnd: new Date(Date.now() + 20 * day) });
  // Stored status stays 'active' after the end date passes; nothing flips it.
  await Member.updateOne({ _id: lapsed._id }, { membershipEnd: new Date(Date.now() - 3 * day) });
}, 120000);
afterAll(disconnect);

describe('"active members" excludes memberships past their end date', () => {
  it('on the tenant dashboard, in total and per branch', async () => {
    const res = await request(app).get('/api/dashboard/summary').set(auth(t.adminToken));
    expect(res.status).toBe(200);
    expect(res.body.activeMembers).toBe(1);
    const branch = res.body.perBranch.find((b) => b.branchId === t.branch._id.toString());
    expect(branch.activeMembers).toBe(1);
    expect(branch.totalMembers).toBe(2);
  });

  it('on the branch dashboard', async () => {
    const res = await request(app).get('/api/dashboard/summary').set(auth(t.managerToken));
    expect(res.status).toBe(200);
    expect(res.body.activeMembers).toBe(1);
  });

  it('in the plan mix report', async () => {
    const res = await request(app).get('/api/reports/summary').set(auth(t.adminToken));
    expect(res.status).toBe(200);
    const total = (res.body.planMix || []).reduce((n, p) => n + p.activeMembers, 0);
    expect(total).toBe(1);
  });
});

describe('payment settings reject values that would break the QR code', () => {
  const put = (body) => request(app).put('/api/tenant-settings').set(auth(t.adminToken)).send(body);

  it('accepts a normal UPI id and an https link, and lets both be cleared', async () => {
    expect((await put({ upiId: 'gym.name@okbank', upiPaymentLink: 'https://pay.example.com/gym' })).status).toBe(200);
    expect((await put({ upiId: '', upiPaymentLink: '' })).status).toBe(200);
  });

  it.each([['not a upi id'], ['nobank@'], ['@bank'], ['a b@bank']])('rejects the UPI id %p', async (upiId) => {
    expect((await put({ upiId })).status).toBe(400);
  });

  it('rejects a payment link that is not https', async () => {
    expect((await put({ upiPaymentLink: 'http://pay.example.com' })).status).toBe(400);
    expect((await put({ upiPaymentLink: 'javascript:alert(1)' })).status).toBe(400);
  });
});

describe('trainer salary', () => {
  const put = (token, body) => request(app).put(`/api/staff/${t.trainer._id}`).set(auth(token)).send(body);

  it('is saved when valid, and can be cleared', async () => {
    expect((await put(t.adminToken, { name: 'fix trainer', salary: 25000 })).body.salary).toBe(25000);
    expect((await put(t.adminToken, { name: 'fix trainer', salary: null })).body.salary).toBeNull();
  });

  it('cannot be negative or absurdly large', async () => {
    expect((await put(t.adminToken, { name: 'fix trainer', salary: -100 })).status).toBe(400);
    expect((await put(t.adminToken, { name: 'fix trainer', salary: 1e12 })).status).toBe(400);
  });
});
