const { app, request, connect, disconnect, seedTenant, createMember, auth, login, PASSWORD } = require('./helpers');
const User = require('../models/User');

let t; let other; let member;

const staffLogin = (email, password) => request(app).post('/api/auth/login').send({ email, password });
const memberLogin = (identifier, password) => request(app).post('/api/member-auth/login').send({ identifier, password });
// JWT iat has one-second resolution, so a login and a reset in the same second are not
// ordered. Waiting out the second makes "token issued before the reset" unambiguous.
const tick = () => new Promise((r) => setTimeout(r, 1100));

beforeAll(async () => {
  await connect();
  t = await seedTenant('reset');
  other = await seedTenant('reset-other');
  member = await createMember(t.managerToken, { branchId: t.branch._id.toString(), planId: t.plan._id.toString(), name: 'Reset Member', phone: '9680000001' });
}, 90000);
afterAll(disconnect);

describe('trainer password reset', () => {
  it('is refused for a trainer, and for another gym', async () => {
    expect((await request(app).post(`/api/staff/${t.trainer._id}/reset-password`).set(auth(t.trainerToken))).status).toBe(403);
    expect((await request(app).post(`/api/staff/${t.trainer._id}/reset-password`).set(auth(other.managerToken))).status).toBe(404);
  });

  it('lets a branch manager issue a temporary password that works, and the old one stops', async () => {
    const res = await request(app).post(`/api/staff/${t.trainer._id}/reset-password`).set(auth(t.managerToken));
    expect(res.status).toBe(200);
    expect(res.body.password).toHaveLength(10);
    expect(res.body.email).toBe(t.trainer.email);

    expect((await staffLogin(t.trainer.email, res.body.password)).status).toBe(200);
    expect((await staffLogin(t.trainer.email, PASSWORD)).status).toBe(401);
  });

  it('stores only a hash', async () => {
    const doc = await User.findById(t.trainer._id);
    expect(doc.password).toMatch(/^\$2[aby]\$/);
  });

  it('lets a tenant admin reset a trainer in any branch of the gym', async () => {
    expect((await request(app).post(`/api/staff/${t.trainer._id}/reset-password`).set(auth(t.adminToken))).status).toBe(200);
  });

  it('a branch manager resets trainers only; the owner can also reset a manager; nobody resets the owner this way', async () => {
    expect((await request(app).post(`/api/staff/${t.manager._id}/reset-password`).set(auth(t.managerToken))).status).toBe(404); // another manager's (here, their own) password is not theirs to reset
    expect((await request(app).post(`/api/staff/${t.admin._id}/reset-password`).set(auth(t.managerToken))).status).toBe(404);
    expect((await request(app).post(`/api/staff/${t.admin._id}/reset-password`).set(auth(t.adminToken))).status).toBe(404); // owners are reset by platform staff
    // a manager of their own, so that ending their sessions does not disturb the shared one other tests use
    const another = await User.create({ name: 'Spare manager', email: `spare-${Date.now()}@example.com`, phone: '9000000071', password: PASSWORD, role: 'branch-manager', tenantId: t.tenant._id, branchId: t.branch._id });
    expect((await request(app).post(`/api/staff/${another._id}/reset-password`).set(auth(t.adminToken))).status).toBe(200);
  });

  it('signs the trainer out of sessions they already had', async () => {
    const before = await login(t.trainer.email, (await (async () => {
      const r = await request(app).post(`/api/staff/${t.trainer._id}/reset-password`).set(auth(t.managerToken));
      return r.body.password;
    })()));
    expect((await request(app).get('/api/auth/me').set(auth(before))).status).toBe(200);
    await tick();
    await request(app).post(`/api/staff/${t.trainer._id}/reset-password`).set(auth(t.managerToken));
    expect((await request(app).get('/api/auth/me').set(auth(before))).status).toBe(401);
  });
});

describe('changing your own password does not log you out', () => {
  it('keeps the current session valid', async () => {
    const reset = await request(app).post(`/api/staff/${t.trainer._id}/reset-password`).set(auth(t.managerToken));
    await tick();
    const token = await login(t.trainer.email, reset.body.password);
    const change = await request(app).post('/api/auth/change-password').set(auth(token)).send({ currentPassword: reset.body.password, newPassword: 'BrandNewPass123!' });
    expect(change.status).toBe(200);
    expect((await request(app).get('/api/auth/me').set(auth(token))).status).toBe(200);
  });
});

describe('member password reset', () => {
  it('issues a new password, replaces the old one, and signs the member out of old sessions', async () => {
    const first = await request(app).post(`/api/members/${member._id}/app-access`).set(auth(t.managerToken));
    const session = await memberLogin(first.body.memberCode, first.body.password);
    expect(session.status).toBe(200);
    expect((await request(app).get('/api/member-app/me').set(auth(session.body.token))).status).toBe(200);

    await tick();
    const second = await request(app).post(`/api/members/${member._id}/app-access`).set(auth(t.managerToken));
    expect(second.body.password).not.toBe(first.body.password);

    expect((await memberLogin(first.body.memberCode, first.body.password)).status).toBe(401);
    expect((await memberLogin(second.body.memberCode, second.body.password)).status).toBe(200);
    expect((await request(app).get('/api/member-app/me').set(auth(session.body.token))).status).toBe(401);
  });

  it('lets a member change their own password without being logged out', async () => {
    const a = await request(app).post(`/api/members/${member._id}/app-access`).set(auth(t.managerToken));
    await tick();
    const s = await memberLogin(a.body.memberCode, a.body.password);
    const change = await request(app).put('/api/member-app/me/password').set(auth(s.body.token)).send({ currentPassword: a.body.password, newPassword: 'MyOwnPassw0rd!' });
    expect(change.status).toBe(200);
    // Their own session continues on the fresh token the change returns. (The old token is retired
    // along with every other device's, but only once the clock ticks over a second, so asserting on
    // it here would be flaky; security.test.js covers revocation with a deliberate wait.)
    expect(change.body.token).toBeTruthy();
    expect((await request(app).get('/api/member-app/me').set(auth(change.body.token))).status).toBe(200);
  });
});
