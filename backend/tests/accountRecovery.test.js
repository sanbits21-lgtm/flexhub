const { app, request, connect, disconnect, seedTenant, createMember, createSuperAdmin, login, auth, uniq, PASSWORD } = require('./helpers');
const User = require('../models/User');
const Member = require('../models/Member');
const Branch = require('../models/Branch');
const LoginAttempt = require('../models/LoginAttempt');
const AuditLog = require('../models/AuditLog');

// Someone cannot sign in and cannot use an email link: staff give them a temporary password, and it must actually work.

let t; let other; let su; let pa; let paToken; let north; let northManager;
const tick = () => new Promise((r) => setTimeout(r, 1100));
const staffLogin = (email, password = 'wrong-password') => request(app).post('/api/auth/login').send({ email, password });
const memberLogin = (identifier, password) => request(app).post('/api/member-auth/login').send({ identifier, password });
const wrong = async (fn, n = 5) => { for (let i = 0; i < n; i += 1) await fn(); };

beforeAll(async () => {
  await connect();
  await LoginAttempt.deleteMany({});
  t = await seedTenant('rec');
  other = await seedTenant('recother');
  su = await createSuperAdmin();
  north = await Branch.create({ tenantId: t.tenant._id, name: 'North' });
  northManager = await User.create({ name: 'North manager', email: `nm-${uniq('x')}@example.com`, phone: '9000000066', password: PASSWORD, role: 'branch-manager', tenantId: t.tenant._id, branchId: north._id });
  const email = `${uniq('pa')}@example.com`;
  pa = await User.create({ name: 'Scoped PA', email, phone: '9000000067', password: PASSWORD, role: 'platform-admin', managedTenantIds: [other.tenant._id] });
  paToken = await login(email);
}, 120000);
afterAll(async () => { await LoginAttempt.deleteMany({}); await disconnect(); });
beforeEach(async () => { await LoginAttempt.deleteMany({}); });

describe('the owner resets a branch manager', () => {
  it('gives a temporary password that works, once, and the old one stops', async () => {
    const res = await request(app).post(`/api/staff/${northManager._id}/reset-password`).set(auth(t.adminToken));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'North manager', email: northManager.email });
    expect(res.body.password).toHaveLength(10);
    expect((await staffLogin(northManager.email, res.body.password)).status).toBe(200);
    expect((await staffLogin(northManager.email, PASSWORD)).status).toBe(401);
    expect((await User.findById(northManager._id)).password).toMatch(/^\$2[aby]\$/); // stored as a hash
  });

  it('ends the manager\'s existing sessions', async () => {
    const first = await request(app).post(`/api/staff/${northManager._id}/reset-password`).set(auth(t.adminToken));
    await tick();
    const token = await login(northManager.email, first.body.password);
    expect((await request(app).get('/api/auth/me').set(auth(token))).status).toBe(200);
    await tick();
    await request(app).post(`/api/staff/${northManager._id}/reset-password`).set(auth(t.adminToken));
    expect((await request(app).get('/api/auth/me').set(auth(token))).status).toBe(401);
  });

  it("is refused for another gym's owner, a trainer, and the manager themselves", async () => {
    expect((await request(app).post(`/api/staff/${northManager._id}/reset-password`).set(auth(other.adminToken))).status).toBe(404);
    expect((await request(app).post(`/api/staff/${northManager._id}/reset-password`).set(auth(t.trainerToken))).status).toBe(403);
    expect((await request(app).post(`/api/staff/${northManager._id}/reset-password`).set(auth(t.managerToken))).status).toBe(404); // the other branch's manager
  });

  it('is written to the audit log', async () => {
    await request(app).post(`/api/staff/${northManager._id}/reset-password`).set(auth(t.adminToken));
    expect(await AuditLog.countDocuments({ action: 'RESET_MANAGER_PASSWORD', targetId: northManager._id })).toBeGreaterThan(0);
  });
});

describe('a person locked out by wrong guesses can use the new password at once', () => {
  it('staff: the lock is lifted by a reset from the gym', async () => {
    await wrong(() => staffLogin(t.trainer.email));
    expect((await staffLogin(t.trainer.email, PASSWORD)).status).toBe(429); // locked, even with the right password
    const reset = await request(app).post(`/api/staff/${t.trainer._id}/reset-password`).set(auth(t.managerToken));
    expect(reset.status).toBe(200);
    expect((await staffLogin(t.trainer.email, reset.body.password)).status).toBe(200);
  });

  it('members: issuing app access lifts the lock', async () => {
    const m = await createMember(t.managerToken, { branchId: t.branch._id.toString(), planId: t.plan._id.toString(), name: 'Locked Member', phone: '9690000001' });
    const first = await request(app).post(`/api/members/${m._id}/app-access`).set(auth(t.managerToken));
    await wrong(() => memberLogin(first.body.memberCode, 'not-the-password'));
    expect((await memberLogin(first.body.memberCode, first.body.password)).status).toBe(429);
    const second = await request(app).post(`/api/members/${m._id}/app-access`).set(auth(t.managerToken));
    expect((await memberLogin(second.body.memberCode, second.body.password)).status).toBe(200);
  });
});

describe('platform staff reset a gym owner', () => {
  it('lists the owners of a gym, without any password', async () => {
    const res = await request(app).get(`/api/tenants/${t.tenant._id}/tenant-admins`).set(auth(su.token));
    expect(res.status).toBe(200);
    expect(res.body.map((o) => o.email)).toContain(t.admin.email);
    expect(JSON.stringify(res.body)).not.toMatch(/\$2[aby]\$/);
    expect(res.body[0].password).toBeUndefined();
  });

  it('gives the owner a temporary password that works, lifts a lock, and ends their sessions', async () => {
    const old = await login(t.admin.email);
    await wrong(() => staffLogin(t.admin.email));
    expect((await staffLogin(t.admin.email, PASSWORD)).status).toBe(429);
    await tick();
    const res = await request(app).post(`/api/tenants/${t.tenant._id}/tenant-admins/${t.admin._id}/reset-password`).set(auth(su.token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: t.admin.name, email: t.admin.email, emailConfirmed: true });
    expect(res.body.password).toHaveLength(10);
    expect((await staffLogin(t.admin.email, res.body.password)).status).toBe(200);
    expect((await request(app).get('/api/auth/me').set(auth(old))).status).toBe(401);
    expect(await AuditLog.countDocuments({ action: 'RESET_OWNER_PASSWORD', targetId: t.admin._id })).toBeGreaterThan(0);
  });

  it('only for the platform team, and only for the gym the person manages', async () => {
    const url = `/api/tenants/${t.tenant._id}/tenant-admins/${t.admin._id}/reset-password`;
    expect((await request(app).post(url).set(auth(t.managerToken))).status).toBe(403); // gym staff cannot use this
    expect((await request(app).post(url).set(auth(other.managerToken))).status).toBe(403);
    expect((await request(app).post(url).set(auth(other.trainerToken))).status).toBe(403);
    expect((await request(app).post(url).set(auth(paToken))).status).toBe(404); // this platform admin manages another gym
    expect((await request(app).get(`/api/tenants/${t.tenant._id}/tenant-admins`).set(auth(paToken))).status).toBe(404);
    // the one they do manage works
    expect((await request(app).post(`/api/tenants/${other.tenant._id}/tenant-admins/${other.admin._id}/reset-password`).set(auth(paToken))).status).toBe(200);
  });

  it("will not reset someone who is not an owner of that gym", async () => {
    const wrongGym = `/api/tenants/${t.tenant._id}/tenant-admins/${other.admin._id}/reset-password`;
    expect((await request(app).post(wrongGym).set(auth(su.token))).status).toBe(404); // another gym's owner
    const notOwner = `/api/tenants/${t.tenant._id}/tenant-admins/${t.manager._id}/reset-password`;
    expect((await request(app).post(notOwner).set(auth(su.token))).status).toBe(404); // a manager is not an owner
  });

  it('warns when the owner never confirmed their email, since they cannot sign in until they do', async () => {
    await User.updateOne({ _id: other.admin._id }, { emailVerified: false });
    const res = await request(app).post(`/api/tenants/${other.tenant._id}/tenant-admins/${other.admin._id}/reset-password`).set(auth(su.token));
    expect(res.body.emailConfirmed).toBe(false);
  });
});

describe('guessing the current password while signed in', () => {
  const change = (token, currentPassword, newPassword = 'Brand-New-Pass-77') => request(app).post('/api/auth/change-password').set(auth(token)).send({ currentPassword, newPassword });
  const freshStaff = async (label) => {
    const email = `${uniq(label)}@example.com`;
    const user = await User.create({ name: `Guard ${label}`, email, phone: '9000000072', password: PASSWORD, role: 'trainer', tenantId: t.tenant._id, branchId: t.branch._id });
    return { user, email, token: await login(email) };
  };

  it('locks after five wrong passwords, even for the right one, and says how long', async () => {
    const who = await freshStaff('lock');
    for (let i = 0; i < 5; i += 1) expect((await change(who.token, 'not-it')).status).toBe(400);
    const locked = await change(who.token, PASSWORD);
    expect(locked.status).toBe(429);
    expect(locked.body).toMatchObject({ code: 'PASSWORD_CHECK_LOCKED' });
    expect(locked.body.message).toMatch(/Try again in 15 minutes/);
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(14 * 60);
    expect((await User.findById(who.user._id)).password).toMatch(/^\$2[aby]\$/); // nothing was changed
    expect((await staffLogin(who.email, PASSWORD)).status).toBe(200); // signing in is a separate count and still works
  });

  it('a right password clears the count, and the new password works', async () => {
    const who = await freshStaff('clear');
    for (let i = 0; i < 3; i += 1) await change(who.token, 'not-it');
    const ok = await change(who.token, PASSWORD);
    expect(ok.status).toBe(200);
    for (let i = 0; i < 4; i += 1) expect((await change(ok.body.token, 'still-not-it')).status).toBe(400); // counting from zero again
    expect((await staffLogin(who.email, 'Brand-New-Pass-77')).status).toBe(200);
    expect((await staffLogin(who.email, PASSWORD)).status).toBe(401);
  });

  it('one person being locked does not lock anyone else', async () => {
    const a = await freshStaff('a');
    const b = await freshStaff('b');
    for (let i = 0; i < 5; i += 1) await change(a.token, 'not-it');
    expect((await change(a.token, PASSWORD)).status).toBe(429);
    expect((await change(b.token, PASSWORD)).status).toBe(200);
  });

  it('members get the same limit on changing their password and on deleting their account', async () => {
    const m = await createMember(t.managerToken, { branchId: t.branch._id.toString(), planId: t.plan._id.toString(), name: 'Guard Member', phone: '9690000077' });
    const access = await request(app).post(`/api/members/${m._id}/app-access`).set(auth(t.managerToken));
    const token = (await memberLogin(access.body.memberCode, access.body.password)).body.token;
    const changeM = (cur) => request(app).put('/api/member-app/me/password').set(auth(token)).send({ currentPassword: cur, newPassword: 'Another-Good-Pass-9' });
    const del = (pw) => request(app).delete('/api/member-app/me').set(auth(token)).send({ password: pw });
    for (let i = 0; i < 3; i += 1) expect((await changeM('nope-nope')).status).toBe(400);
    for (let i = 0; i < 2; i += 1) expect((await del('nope-nope')).status).toBe(400); // the two screens share one count
    expect((await changeM(access.body.password)).status).toBe(429);
    const locked = await del(access.body.password);
    expect(locked.status).toBe(429);
    expect(locked.body.code).toBe('PASSWORD_CHECK_LOCKED');
    expect((await Member.findById(m._id)).isActive).toBe(true); // the account was not deleted
  });
});
