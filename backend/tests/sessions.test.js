const jwt = require('jsonwebtoken');
const { app, request, connect, disconnect, seedTenant, createMember, auth, PASSWORD } = require('./helpers');
const Session = require('../models/Session');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Member = require('../models/Member');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const setCookie = (res, name) => (res.headers['set-cookie'] || []).find((c) => c.startsWith(`${name}=`));
const cookieValue = (c) => c.split(';')[0].slice(c.indexOf('=') + 1);

const staffLogin = (email, headers = {}) => request(app).post('/api/auth/login').set(headers).send({ email, password: PASSWORD });
const native = { 'X-Client': 'native' };
const web = { 'X-Requested-With': 'flexhub' };
const refreshNative = (refreshToken, path = '/api/auth/refresh') => request(app).post(path).set(native).send({ refreshToken });
const refreshWeb = (cookie, name = 'fh_rt', path = '/api/auth/refresh', extra = web) => request(app).post(path).set(extra).set('Cookie', `${name}=${cookie}`).send({});
const me = (token) => request(app).get('/api/auth/me').set(auth(token));

let t;
beforeAll(async () => {
  await connect();
  t = await seedTenant('sess');
}, 90000);
afterAll(async () => {
  delete process.env.BASE_DOMAIN;
  await Session.deleteMany({});
  await disconnect();
});

describe('signing in starts a session', () => {
  it('web: a short access token in the body and the refresh token only in an httpOnly cookie', async () => {
    const res = await staffLogin(t.admin.email);
    expect(res.status).toBe(200);
    expect(res.body.refreshToken).toBeUndefined();
    const cookie = setCookie(res, 'fh_rt');
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/auth(;|$)/);
    expect(cookie).not.toMatch(/Secure/i); // plain http in this test
    const claims = jwt.decode(res.body.token);
    expect(claims.sid).toBeTruthy();
    expect(claims.exp - claims.iat).toBe(15 * 60);
  });

  it('marks the cookie Secure when the request came over https (behind the proxy)', async () => {
    const res = await staffLogin(t.admin.email, { 'X-Forwarded-Proto': 'https' });
    expect(setCookie(res, 'fh_rt')).toMatch(/Secure/i);
  });

  it('native app: the refresh token comes in the body and no cookie is set', async () => {
    const res = await staffLogin(t.admin.email, native);
    expect(res.body.refreshToken).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(setCookie(res, 'fh_rt')).toBeUndefined();
  });

  it('stores only a hash of the refresh token', async () => {
    const res = await staffLogin(t.admin.email, native);
    expect(await Session.countDocuments({ tokenHash: res.body.refreshToken })).toBe(0);
    expect(await Session.countDocuments({ tokenHash: /^[0-9a-f]{64}$/ })).toBeGreaterThan(0);
  });

  it('members get their own cookie on their own path', async () => {
    const m = await createMember(t.managerToken, { branchId: t.branch._id.toString(), planId: t.plan._id.toString(), name: 'Mem', phone: '9400000011' });
    const access = (await request(app).post(`/api/members/${m._id}/app-access`).set(auth(t.managerToken))).body;
    const res = await request(app).post('/api/member-auth/login').send({ identifier: access.memberCode, password: access.password });
    expect(res.status).toBe(200);
    const cookie = setCookie(res, 'fh_mrt');
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/member-auth(;|$)/);
    expect(setCookie(res, 'fh_rt')).toBeUndefined();
  });
});

describe('access tokens run out', () => {
  it('answers TOKEN_EXPIRED so the client knows to refresh, and plain 401 for a bad token', async () => {
    const expired = jwt.sign({ id: t.admin._id, actorType: 'user' }, process.env.JWT_SECRET, { expiresIn: -10 });
    const res = await me(expired);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_EXPIRED');
    const bad = await me('not.a.token');
    expect(bad.status).toBe(401);
    expect(bad.body.code).toBeUndefined();
  });
});

describe('refreshing', () => {
  it('native: swaps the refresh token for a new pair, and the new access token works', async () => {
    const first = (await staffLogin(t.admin.email, native)).body;
    const next = await refreshNative(first.refreshToken);
    expect(next.status).toBe(200);
    expect(next.body.refreshToken).toBeTruthy();
    expect(next.body.refreshToken).not.toBe(first.refreshToken);
    expect((await me(next.body.token)).status).toBe(200);
    expect(jwt.decode(next.body.token).sid).not.toBe(jwt.decode(first.token).sid);
  });

  it('web: uses the cookie, needs the custom header, and sets a replacement cookie', async () => {
    const login = await staffLogin(t.admin.email);
    const cookie = cookieValue(setCookie(login, 'fh_rt'));
    const noHeader = await refreshWeb(cookie, 'fh_rt', '/api/auth/refresh', {});
    expect(noHeader.status).toBe(403);
    expect(noHeader.body.code).toBe('CSRF');
    const ok = await refreshWeb(cookie);
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();
    expect(ok.body.refreshToken).toBeUndefined();
    expect(cookieValue(setCookie(ok, 'fh_rt'))).not.toBe(cookie);
  });

  it('a refresh token in the body is ignored unless it is the native app asking', async () => {
    const native1 = (await staffLogin(t.admin.email, native)).body;
    const res = await request(app).post('/api/auth/refresh').set(web).send({ refreshToken: native1.refreshToken });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('NO_REFRESH');
  });

  it('refuses unknown, missing and wrong-kind tokens', async () => {
    expect((await refreshNative('nope')).body.code).toBe('REFRESH_INVALID');
    expect((await request(app).post('/api/auth/refresh').set(web).send({})).body.code).toBe('NO_REFRESH');
    const staff = (await staffLogin(t.admin.email, native)).body;
    expect((await refreshNative(staff.refreshToken, '/api/member-auth/refresh')).status).toBe(401); // a staff token is not a member token
  });

  it('accepts a token that was swapped a moment ago (lost response, two tabs)', async () => {
    const first = (await staffLogin(t.admin.email, native)).body;
    expect((await refreshNative(first.refreshToken)).status).toBe(200);
    expect((await refreshNative(first.refreshToken)).status).toBe(200); // same token again, inside the grace window
  });

  it('treats an old token coming back later as theft and ends that whole login', async () => {
    const first = (await staffLogin(t.admin.email, native)).body;
    const second = (await refreshNative(first.refreshToken)).body;
    await Session.updateMany({ rotatedAt: { $exists: true } }, { rotatedAt: new Date(Date.now() - 5 * 60 * 1000) });
    const reuse = await refreshNative(first.refreshToken);
    expect(reuse.status).toBe(401);
    expect(reuse.body.code).toBe('REFRESH_REUSED');
    expect((await refreshNative(second.refreshToken)).status).toBe(401); // the legitimate holder is signed out too
  });

  it('retires the old token for a day and keeps one live token per login', async () => {
    const first = (await staffLogin(t.admin.email, native)).body;
    const familyId = (await Session.findOne({ tokenHash: require('../utils/sessions').hash(first.refreshToken) })).familyId;
    await refreshNative(first.refreshToken);
    const rows = await Session.find({ familyId });
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => !r.rotatedAt)).toHaveLength(1);
    const retired = rows.find((r) => r.rotatedAt);
    expect(retired.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 24 * 3600 * 1000 + 5000);
  });

  it('ends a session that sat unused too long, or has been refreshed past the absolute limit', async () => {
    const a = (await staffLogin(t.admin.email, native)).body;
    await Session.updateMany({ actorId: t.admin._id }, { expiresAt: new Date(Date.now() - 1000) });
    expect((await refreshNative(a.refreshToken)).body.code).toBe('REFRESH_EXPIRED');
    const b = (await staffLogin(t.admin.email, native)).body;
    await Session.updateMany({ actorId: t.admin._id }, { startedAt: new Date(Date.now() - 200 * 86400000) });
    expect((await refreshNative(b.refreshToken)).body.code).toBe('REFRESH_EXPIRED');
  });
});

describe('a refresh re-checks the person and the gym', () => {
  it('refuses a deactivated user and ends their login', async () => {
    const s = await seedTenant('deact');
    const tok = (await staffLogin(s.manager.email, native)).body;
    const { familyId } = await Session.findOne({ tokenHash: require('../utils/sessions').hash(tok.refreshToken) });
    await User.updateOne({ _id: s.manager._id }, { isActive: false });
    expect((await refreshNative(tok.refreshToken)).status).toBe(401);
    expect(await Session.countDocuments({ familyId })).toBe(0);
  });

  it('refuses people of a suspended gym', async () => {
    const s = await seedTenant('susp');
    const tok = (await staffLogin(s.admin.email, native)).body;
    await Tenant.updateOne({ _id: s.tenant._id }, { billingStatus: 'suspended', isActive: false });
    const res = await refreshNative(tok.refreshToken);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('GYM_SUSPENDED');
  });

  it("refuses a gym's person on another gym's own address", async () => {
    process.env.BASE_DOMAIN = 'example.test';
    const a = await seedTenant('hosta');
    const b = await seedTenant('hostb');
    const tok = (await staffLogin(a.admin.email, { ...native, Host: `${a.tenant.slug}.example.test` })).body;
    expect(tok.refreshToken).toBeTruthy();
    const wrong = await request(app).post('/api/auth/refresh').set({ ...native, Host: `${b.tenant.slug}.example.test` }).send({ refreshToken: tok.refreshToken });
    expect(wrong.status).toBe(401);
    const right = await request(app).post('/api/auth/refresh').set({ ...native, Host: `${a.tenant.slug}.example.test` }).send({ refreshToken: tok.refreshToken });
    expect(right.status).toBe(200);
    delete process.env.BASE_DOMAIN;
  });
});

describe('signing out', () => {
  it('logout ends this login (native by body, web by cookie) and clears the cookie', async () => {
    const n = (await staffLogin(t.admin.email, native)).body;
    expect((await request(app).post('/api/auth/logout').set(native).send({ refreshToken: n.refreshToken })).status).toBe(200);
    expect((await refreshNative(n.refreshToken)).status).toBe(401);

    const login = await staffLogin(t.admin.email);
    const cookie = cookieValue(setCookie(login, 'fh_rt'));
    const out = await request(app).post('/api/auth/logout').set(web).set('Cookie', `fh_rt=${cookie}`).send({});
    expect(out.status).toBe(200);
    expect(setCookie(out, 'fh_rt')).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect((await refreshWeb(cookie)).status).toBe(401);
  });

  it('logout never fails, even with nothing to log out of', async () => {
    expect((await request(app).post('/api/auth/logout').send({})).status).toBe(200);
  });

  it('logout-all ends every device of that person, and nobody else', async () => {
    const s = await seedTenant('all');
    const a = (await staffLogin(s.admin.email, native)).body;
    const b = (await staffLogin(s.admin.email, native)).body;
    const other = (await staffLogin(s.manager.email, native)).body;
    expect((await request(app).post('/api/auth/logout-all').set(auth(a.token))).status).toBe(200);
    expect((await refreshNative(a.refreshToken)).status).toBe(401);
    expect((await refreshNative(b.refreshToken)).status).toBe(401);
    expect((await refreshNative(other.refreshToken)).status).toBe(200);
    expect((await request(app).post('/api/auth/logout-all').set(auth(other.token))).status).toBe(200);
    expect((await request(app).post('/api/member-auth/logout-all').set(auth(other.token))).status).toBe(403); // wrong kind of person
  });
});

describe('what ends other sessions', () => {
  it('changing your password ends your other devices but not this one', async () => {
    const s = await seedTenant('chpw');
    const here = (await staffLogin(s.admin.email, native)).body;
    const there = (await staffLogin(s.admin.email, native)).body;
    await wait(1100);
    const res = await request(app).post('/api/auth/change-password').set(auth(here.token)).send({ currentPassword: PASSWORD, newPassword: 'BrandNew-Pass-1' });
    expect(res.status).toBe(200);
    expect(jwt.decode(res.body.token).sid).toBe(jwt.decode(here.token).sid);
    expect((await refreshNative(there.refreshToken)).status).toBe(401);
    expect((await refreshNative(here.refreshToken)).status).toBe(200);
  });

  it("a manager re-issuing a member's app login signs that member out everywhere", async () => {
    const s = await seedTenant('reissue');
    const m = await createMember(s.managerToken, { branchId: s.branch._id.toString(), planId: s.plan._id.toString(), name: 'Mem', phone: '9400000012' });
    const first = (await request(app).post(`/api/members/${m._id}/app-access`).set(auth(s.managerToken))).body;
    const login = await request(app).post('/api/member-auth/login').set(native).send({ identifier: first.memberCode, password: first.password });
    expect((await refreshNative(login.body.refreshToken, '/api/member-auth/refresh')).status).toBe(200);
    await request(app).post(`/api/members/${m._id}/app-access`).set(auth(s.managerToken));
    expect((await refreshNative(login.body.refreshToken, '/api/member-auth/refresh')).status).toBe(401);
  });

  it('a member deleting their account ends their sessions', async () => {
    const s = await seedTenant('delacct');
    const m = await createMember(s.managerToken, { branchId: s.branch._id.toString(), planId: s.plan._id.toString(), name: 'Mem', phone: '9400000013' });
    const access = (await request(app).post(`/api/members/${m._id}/app-access`).set(auth(s.managerToken))).body;
    const login = await request(app).post('/api/member-auth/login').set(native).send({ identifier: access.memberCode, password: access.password });
    await request(app).delete('/api/member-app/me').set(auth(login.body.token)).send({ password: access.password });
    expect((await refreshNative(login.body.refreshToken, '/api/member-auth/refresh')).status).toBe(401);
    expect((await Member.findById(m._id)).isActive).toBe(false);
  });
});
