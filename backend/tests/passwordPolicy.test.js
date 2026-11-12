const { app, request, connect, disconnect, seedTenant, createMember, createSuperAdmin, auth, uniq, PASSWORD } = require('./helpers');
const { checkPassword, passwordProblem } = require('../utils/passwordPolicy');
const { bootstrapSuperAdmin } = require('../utils/bootstrapAdmin');

const GOOD = 'Orchid-Lantern-47!';
let t; let sa;
beforeAll(async () => { await connect(); t = await seedTenant('pw'); sa = await createSuperAdmin(); }, 90000);
afterAll(async () => { await disconnect(); });

describe('what counts as too easy to guess', () => {
  const who = { email: 'asha.rao@example.com', name: 'Asha Rao', phone: '+91 98123 45678' };

  it('accepts ordinary good passwords', () => {
    for (const ok of [GOOD, PASSWORD, 'BrandNew-Pass-1', 'correct horse battery', 'Zebra#Maple#2291', 'my-dog-Biscuit-eats-socks']) {
      expect([ok, checkPassword(ok, who)]).toEqual([ok, null]);
    }
  });

  it('refuses the passwords everyone tries first, even dressed up with digits and symbols', () => {
    for (const bad of ['password', 'Password123!', 'passw0rd', 'Welcome2024!', 'qwerty123', 'iloveyou1', 'Admin@123', 'Flexhub#1', 'Fitzyclub#1', 'FitzyClub2026!', 'letmein!!', 'changeme99']) {
      expect([bad, checkPassword(bad, who)]).toEqual([bad, expect.stringMatching(/too common/)]);
    }
  });

  it('refuses number, alphabet and keyboard runs', () => {
    for (const bad of ['12345678', '987654321', 'abcdefgh', 'qwertyui', 'asdfghjkl', 'ZXCVBNM1']) {
      expect([bad, checkPassword(bad, who)]).toEqual([bad, expect.any(String)]);
    }
  });

  it('refuses repetition', () => {
    expect(checkPassword('aaaaaaaa')).toMatch(/repetitive/);
    expect(checkPassword('abababab')).toMatch(/repetitive/);
    expect(checkPassword('1212121212')).toMatch(/repetitive/);
  });

  it("refuses the person's own name, email name and phone number", () => {
    expect(checkPassword('Asha-lifts-2020', who)).toMatch(/name, email or phone/);
    expect(checkPassword('xx-asha.rao-xx', who)).toMatch(/name, email or phone/);
    expect(checkPassword('call345678now', who)).toMatch(/name, email or phone/);
    expect(checkPassword('Asha-lifts-2020', { name: 'Someone Else' })).toBeNull(); // only matters for that person
  });

  it('leaves length to the length rule, and phrases itself as a sentence for API errors', () => {
    expect(checkPassword('short')).toBeNull();
    expect(passwordProblem('Password123!')).toMatch(/^Password is too common\.$|^Password is too common\. Choose something harder to guess\.$/);
    expect(passwordProblem(GOOD)).toBeNull();
  });
});

describe('every place a person picks a password', () => {
  it('changing your own password (staff)', async () => {
    const weak = await request(app).post('/api/auth/change-password').set(auth(t.adminToken)).send({ currentPassword: PASSWORD, newPassword: 'Password123!' });
    expect(weak.status).toBe(400);
    expect(weak.body.message).toMatch(/too common/);
    const sameName = await request(app).post('/api/auth/change-password').set(auth(t.adminToken)).send({ currentPassword: PASSWORD, newPassword: 'pw-admin-secret-77' });
    expect(sameName.status).toBe(400); // contains a word of the account's own name ("pw admin")
    expect(sameName.body.message).toMatch(/name, email or phone/);
    const ok = await request(app).post('/api/auth/change-password').set(auth(t.adminToken)).send({ currentPassword: PASSWORD, newPassword: GOOD });
    expect(ok.status).toBe(200);
  });

  it("changing a member's own password", async () => {
    const m = await createMember(t.managerToken, { branchId: t.branch._id.toString(), planId: t.plan._id.toString(), name: 'Mem Ber', phone: '9400000031' });
    const access = (await request(app).post(`/api/members/${m._id}/app-access`).set(auth(t.managerToken))).body;
    const login = await request(app).post('/api/member-auth/login').send({ identifier: access.memberCode, password: access.password });
    const weak = await request(app).put('/api/member-app/me/password').set(auth(login.body.token)).send({ currentPassword: access.password, newPassword: 'qwerty123456' });
    expect(weak.status).toBe(400);
    expect(weak.body.message).toMatch(/Password/);
    expect((await request(app).put('/api/member-app/me/password').set(auth(login.body.token)).send({ currentPassword: access.password, newPassword: GOOD })).status).toBe(200);
  });

  it('creating a trainer or manager with a password', async () => {
    const make = (password) => request(app).post('/api/staff').set(auth(t.managerToken)).send({ name: 'New Trainer', email: `trainer-${uniq('n')}@example.com`, phone: '9400000032', password });
    const weak = await make('Welcome2024!');
    expect(weak.status).toBe(400);
    expect(weak.body.message).toMatch(/password/i);
    expect([200, 201]).toContain((await make(GOOD)).status);
  });

  it('onboarding a gym with its first owner, and adding another owner', async () => {
    const owner = (password) => ({ name: 'Gym Co', slug: uniq('gymco').toLowerCase(), contactEmail: `c-${uniq('c')}@example.com`, admin: { name: 'Owner One', email: `o-${uniq('o')}@example.com`, phone: '9400000033', password } });
    const weak = await request(app).post('/api/tenants').set(auth(sa.token)).send(owner('12345678'));
    expect(weak.status).toBe(400);
    expect(weak.body.message).toMatch(/admin.password/);
    const made = await request(app).post('/api/tenants').set(auth(sa.token)).send(owner(GOOD));
    expect(made.status).toBe(201);
    const extra = (password) => request(app).post(`/api/tenants/${made.body.tenant._id}/tenant-admins`).set(auth(sa.token)).send({ name: 'Second Owner', email: `s-${uniq('s')}@example.com`, phone: '9400000034', password });
    expect((await extra('Admin@123')).status).toBe(400);
    expect((await extra(GOOD)).status).toBe(201);
  });

  it('creating a platform admin', async () => {
    const make = (password) => request(app).post('/api/platform-admins').set(auth(sa.token)).send({ name: 'Plat Admin', email: `p-${uniq('p')}@example.com`, phone: '9400000035', password });
    expect((await make('letmein!!')).status).toBe(400);
    expect((await make(GOOD)).status).toBe(201);
  });
});

describe('the first super-admin made from the environment', () => {
  it('is not created with a password on the common list, and says so', async () => {
    const log = { warn: jest.fn(), log: jest.fn() };
    const result = await bootstrapSuperAdmin({ SUPER_ADMIN_EMAIL: `boot-${uniq('b')}@example.com`, SUPER_ADMIN_PASSWORD: 'Password12345!' }, log);
    expect(result).toBeNull();
    expect(log.warn.mock.calls[0][0]).toMatch(/not safe to use.*too common/);
  });
});
