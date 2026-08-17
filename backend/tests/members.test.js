const { app, request, connect, disconnect, seedTenant, createMember, auth } = require('./helpers');
const Member = require('../models/Member');

let t;
const branchId = () => t.branch._id.toString();
const planId = () => t.plan._id.toString();

beforeAll(async () => {
  await connect();
  t = await seedTenant('members');
}, 60000);
afterAll(disconnect);

const monthsBetween = (start, end) =>
  (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());

describe('membership dates are derived server-side', () => {
  it('derives membershipEnd from the plan duration on create', async () => {
    const member = await createMember(t.managerToken, { branchId: branchId(), planId: planId(), phone: '9500000001' });
    expect(monthsBetween(new Date(member.membershipStart), new Date(member.membershipEnd))).toBe(1);
  });

  it('ignores a membershipEnd supplied by the client on update', async () => {
    const member = await createMember(t.managerToken, { branchId: branchId(), planId: planId(), phone: '9500000002' });
    const forged = '2099-12-31';
    const res = await request(app).put(`/api/members/${member._id}`).set(auth(t.managerToken))
      .send({ membershipPlanId: planId(), membershipEnd: forged });
    expect(res.status).toBe(200);
    expect(new Date(res.body.membershipEnd).getFullYear()).not.toBe(2099);
  });

  it('recomputes membershipEnd when the start date moves', async () => {
    const member = await createMember(t.managerToken, { branchId: branchId(), planId: planId(), phone: '9500000003' });
    const res = await request(app).put(`/api/members/${member._id}`).set(auth(t.managerToken))
      .send({ membershipStart: '2026-01-15' });
    expect(res.status).toBe(200);
    expect(new Date(res.body.membershipEnd).toISOString().slice(0, 10)).toBe('2026-02-15');
  });
});

describe('derived membership status', () => {
  it('reports a lapsed member as expired even though it is stored as active', async () => {
    const member = await createMember(t.managerToken, { branchId: branchId(), planId: planId(), phone: '9500000004' });
    await Member.updateOne({ _id: member._id }, { membershipEnd: new Date(Date.now() - 5 * 24 * 3600 * 1000) });

    const stored = await Member.findById(member._id);
    expect(stored.membershipStatus).toBe('active'); // nothing flipped it in the DB

    const res = await request(app).get(`/api/members/${member._id}`).set(auth(t.managerToken));
    expect(res.body.membershipStatus).toBe('expired'); // ...but the API tells the truth
  });

  it('does not override a deliberate frozen status', async () => {
    const member = await createMember(t.managerToken, { branchId: branchId(), planId: planId(), phone: '9500000005' });
    await Member.updateOne({ _id: member._id }, {
      membershipStatus: 'frozen', membershipEnd: new Date(Date.now() - 5 * 24 * 3600 * 1000),
    });
    const res = await request(app).get(`/api/members/${member._id}`).set(auth(t.managerToken));
    expect(res.body.membershipStatus).toBe('frozen');
  });

  it('matches lapsed members on ?membershipStatus=expired and excludes them from active', async () => {
    const member = await createMember(t.managerToken, { branchId: branchId(), planId: planId(), name: 'Lapsed One', phone: '9500000006' });
    await Member.updateOne({ _id: member._id }, { membershipEnd: new Date(Date.now() - 5 * 24 * 3600 * 1000) });

    const expired = await request(app).get('/api/members?membershipStatus=expired&limit=100').set(auth(t.managerToken));
    expect(expired.body.members.some((m) => m._id === member._id)).toBe(true);

    const active = await request(app).get('/api/members?membershipStatus=active&limit=100').set(auth(t.managerToken));
    expect(active.body.members.some((m) => m._id === member._id)).toBe(false);
  });
});

describe('expiry window filter', () => {
  it('returns only memberships lapsing inside the window', async () => {
    const near = await createMember(t.managerToken, { branchId: branchId(), planId: planId(), name: 'Near', phone: '9500000007' });
    const far = await createMember(t.managerToken, { branchId: branchId(), planId: planId(), name: 'Far', phone: '9500000008' });
    await Member.updateOne({ _id: near._id }, { membershipEnd: new Date(Date.now() + 3 * 24 * 3600 * 1000) });
    await Member.updateOne({ _id: far._id }, { membershipEnd: new Date(Date.now() + 90 * 24 * 3600 * 1000) });

    const res = await request(app).get('/api/members?expiringInDays=7&limit=100').set(auth(t.managerToken));
    const ids = res.body.members.map((m) => m._id);
    expect(ids).toContain(near._id);
    expect(ids).not.toContain(far._id);
  });

  it('excludes already-lapsed memberships from the expiring window', async () => {
    const past = await createMember(t.managerToken, { branchId: branchId(), planId: planId(), name: 'Past', phone: '9500000009' });
    await Member.updateOne({ _id: past._id }, { membershipEnd: new Date(Date.now() - 3 * 24 * 3600 * 1000) });
    const res = await request(app).get('/api/members?expiringInDays=30&limit=100').set(auth(t.managerToken));
    expect(res.body.members.map((m) => m._id)).not.toContain(past._id);
  });
});

describe('soft delete', () => {
  it('hides a deactivated member from the list but keeps the record', async () => {
    const member = await createMember(t.managerToken, { branchId: branchId(), planId: planId(), name: 'Gone', phone: '9500000010' });
    expect((await request(app).delete(`/api/members/${member._id}`).set(auth(t.managerToken))).status).toBe(200);

    const list = await request(app).get('/api/members?limit=100').set(auth(t.managerToken));
    expect(list.body.members.map((m) => m._id)).not.toContain(member._id);

    expect(await Member.findById(member._id)).not.toBeNull(); // soft, not destroyed
  });

  it('shows deactivated members again with ?includeInactive=true', async () => {
    const member = await createMember(t.managerToken, { branchId: branchId(), planId: planId(), name: 'Findable', phone: '9500000011' });
    await request(app).delete(`/api/members/${member._id}`).set(auth(t.managerToken));

    const res = await request(app).get('/api/members?includeInactive=true&limit=100').set(auth(t.managerToken));
    expect(res.body.members.map((m) => m._id)).toContain(member._id);
  });

  it('keeps deactivated members out of the dashboard active count', async () => {
    const before = await request(app).get('/api/dashboard/summary').set(auth(t.managerToken));
    const member = await createMember(t.managerToken, { branchId: branchId(), planId: planId(), phone: '9500000012' });
    const after = await request(app).get('/api/dashboard/summary').set(auth(t.managerToken));
    expect(after.body.activeMembers).toBe(before.body.activeMembers + 1);

    await request(app).delete(`/api/members/${member._id}`).set(auth(t.managerToken));
    const afterDelete = await request(app).get('/api/dashboard/summary').set(auth(t.managerToken));
    expect(afterDelete.body.activeMembers).toBe(before.body.activeMembers);
  });
});

describe('duplicate handling', () => {
  it('returns a friendly error rather than a raw Mongo duplicate-key error', async () => {
    const email = 'dupe-check@example.com';
    await request(app).post('/api/members').set(auth(t.managerToken))
      .send({ name: 'First', phone: '9500000013', email, branchId: branchId() });
    const res = await request(app).post('/api/members').set(auth(t.managerToken))
      .send({ name: 'Second', phone: '9500000014', email, branchId: branchId() });
    expect(res.status).toBe(400);
    expect(res.body.message).not.toMatch(/E11000/);
  });
});
