// Rate limiting is off under test by default; this file needs it on, and it has to be set before
// the app is first loaded.
process.env.FORCE_RATE_LIMIT = 'on';
const { spawnSync } = require('child_process');
const path = require('path');
const { app, request, connect, disconnect, seedTenant, createMember, createSuperAdmin, auth, PASSWORD } = require('./helpers');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const secondsAgo = () => wait(1100); // tokens are dated to the second; a change must come after them

beforeAll(async () => { await connect(); }, 90000);
afterAll(async () => { await disconnect(); });

describe('rate limits on the public routes', () => {
  it('stops sign-up after the hourly allowance (they once sat behind the routes and never ran)', async () => {
    const codes = [];
    for (let i = 0; i < 7; i += 1) codes.push((await request(app).post('/api/public/signup').send({ gymName: 'x' })).status);
    expect(codes.slice(0, 5)).toEqual([400, 400, 400, 400, 400]);
    expect(codes.slice(5)).toEqual([429, 429]);
  });

  it('stops repeated email-confirmation attempts', async () => {
    const codes = [];
    for (let i = 0; i < 22; i += 1) codes.push((await request(app).post('/api/public/verify-email').send({ token: 'nope' })).status);
    expect(codes.filter((c) => c === 400)).toHaveLength(20);
    expect(codes.slice(20)).toEqual([429, 429]);
  });
});

describe('request size', () => {
  it('refuses a big body on ordinary and public routes before anyone is signed in', async () => {
    const big = { gymName: 'x'.repeat(150 * 1024) };
    expect((await request(app).post('/api/auth/login').send({ email: 'a@b.co', password: 'x'.repeat(150 * 1024) })).status).toBe(413);
    expect((await request(app).post('/api/public/verify-email').send(big)).status).toBe(413);
  });

  it('still lets a bulk import and a photo carry a larger body', async () => {
    const bulk = await request(app).post('/api/members/bulk').send({ rows: 'x'.repeat(150 * 1024) });
    expect(bulk.status).toBe(401); // got past the size check to the auth check
    const photo = await request(app).put('/api/member-app/me/photo').send({ image: 'A'.repeat(150 * 1024) });
    expect(photo.status).toBe(401);
  });
});

describe('changing a password signs out the other sessions', () => {
  it('staff: the old token stops working, the one returned keeps working, the new password logs in', async () => {
    const t = await seedTenant('pwstaff');
    const old = t.adminToken;
    await secondsAgo();
    const res = await request(app).post('/api/auth/change-password').set(auth(old)).send({ currentPassword: PASSWORD, newPassword: 'BrandNew-Pass-1' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect((await request(app).get('/api/auth/me').set(auth(old))).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set(auth(res.body.token))).status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ email: t.admin.email, password: 'BrandNew-Pass-1' })).status).toBe(200);
  });

  it('a wrong current password changes nothing and signs nobody out', async () => {
    const t = await seedTenant('pwwrong');
    await secondsAgo();
    expect((await request(app).post('/api/auth/change-password').set(auth(t.adminToken)).send({ currentPassword: 'nope', newPassword: 'BrandNew-Pass-1' })).status).toBe(400);
    expect((await request(app).get('/api/auth/me').set(auth(t.adminToken))).status).toBe(200);
  });

  it('members: same, and the web and native apps are told the new token', async () => {
    const t = await seedTenant('pwmember');
    const m = await createMember(t.managerToken, { branchId: t.branch._id.toString(), planId: t.plan._id.toString(), name: 'Mem', phone: '9400000009' });
    const access = (await request(app).post(`/api/members/${m._id}/app-access`).set(auth(t.managerToken))).body;
    const login = () => request(app).post('/api/member-auth/login').send({ identifier: access.memberCode, password: access.password });
    const phone = (await login()).body.token;
    await secondsAgo();
    const other = (await login()).body.token; // a second device, signed in a moment later
    await secondsAgo();
    const res = await request(app).put('/api/member-app/me/password').set(auth(phone)).send({ currentPassword: access.password, newPassword: 'BrandNew-Pass-1' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect((await request(app).get('/api/member-app/me').set(auth(phone))).status).toBe(401);
    expect((await request(app).get('/api/member-app/me').set(auth(other))).status).toBe(401);
    expect((await request(app).get('/api/member-app/me').set(auth(res.body.token))).status).toBe(200);
  });
});

describe('query values that are not plain strings', () => {
  it('are refused instead of becoming part of a database filter', async () => {
    const t = await seedTenant('qinj');
    const sa = await createSuperAdmin();
    expect((await request(app).get('/api/members?branchId[$ne]=x').set(auth(t.adminToken))).status).toBe(400);
    expect((await request(app).get('/api/members?tenantId[$ne]=x').set(auth(sa.token))).status).toBe(400);
    expect((await request(app).get(`/api/members?branchId=${t.branch._id}`).set(auth(t.adminToken))).status).toBe(200);
  });
});

describe('starting in production', () => {
  const start = (env) => spawnSync(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 20000,
    env: { PATH: process.env.PATH, NODE_ENV: 'production', JWT_SECRET: 'a'.repeat(48), MONGODB_URI: 'mongodb://127.0.0.1:1/x', ...env },
  });

  it('refuses to start without a public address, and says why', () => {
    const r = start({});
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/PUBLIC_URL must be set/);
  });

  it('gets past that check when the address is given (and then stops on the unreachable database)', () => {
    const r = start({ PUBLIC_URL: 'https://app.example.com' });
    expect(r.stderr).not.toMatch(/PUBLIC_URL must be set/);
  });

  it("on Render, falls back to the address Render gives the service, so no setup is needed", () => {
    const r = start({ RENDER_EXTERNAL_URL: 'https://flexhub.onrender.com' });
    expect(r.stderr).not.toMatch(/PUBLIC_URL must be set/);
  });

  it('ignores a nonsense address and still refuses', () => {
    const r = start({ PUBLIC_URL: 'app.example.com' }); // no https://
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/PUBLIC_URL must be set/);
  });
});
