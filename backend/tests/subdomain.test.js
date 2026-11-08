const { app, request, connect, disconnect, seedTenant, createMember, createSuperAdmin, auth, PASSWORD } = require('./helpers');
const Tenant = require('../models/Tenant');
const { cleanSlug, cleanBrandColor } = require('../utils/subdomain');

const BASE = 'gym.test';
const host = (slug) => `${slug}.${BASE}`;

let a; let b; let superAdmin;

beforeAll(async () => {
  await connect();
  process.env.BASE_DOMAIN = BASE;
  a = await seedTenant('suba');
  b = await seedTenant('subb');
  superAdmin = await createSuperAdmin();
}, 90000);
afterAll(async () => { delete process.env.BASE_DOMAIN; await disconnect(); });

describe('address rules', () => {
  it('accepts normal names and normalises case', () => {
    expect(cleanSlug('  Iron-Hub ')).toBe('iron-hub');
  });
  it.each(['ab', '-iron', 'iron-', 'iro n', 'iron.hub', 'iron_hub', 'a--b', 'www', 'admin', 'api', 'x'.repeat(31), ''])('rejects %p', (bad) => {
    expect(() => cleanSlug(bad)).toThrow();
  });
  it('rejects brand colours that vanish on the dark theme, and malformed ones', () => {
    expect(cleanBrandColor('#c8f83a')).toBe('#C8F83A');
    expect(() => cleanBrandColor('#101010')).toThrow(/too dark/);
    expect(() => cleanBrandColor('red')).toThrow();
    expect(cleanBrandColor('')).toBe('');
  });
});

describe('public gym lookup by address', () => {
  it('returns the gym name and look for its own address, and nothing private', async () => {
    await Tenant.updateOne({ _id: a.tenant._id }, { 'brand.color': '#FF8A00', 'brand.tagline': 'Lift. Repeat.' });
    const res = await request(app).get('/api/public/tenant').set('Host', host(a.tenant.slug));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ name: a.tenant.name, slug: a.tenant.slug, color: '#FF8A00', color2: '', gradientAngle: 135, logoUrl: '', tagline: 'Lift. Repeat.' });
  });
  it('is 404 for an address nobody owns, and null on the main address', async () => {
    expect((await request(app).get('/api/public/tenant').set('Host', host('nobody-here'))).status).toBe(404);
    const main = await request(app).get('/api/public/tenant').set('Host', BASE);
    expect(main.status).toBe(200);
    expect(main.body).toBeNull();
  });
  it('is 404 for a suspended gym', async () => {
    const s = await seedTenant('subsus');
    await Tenant.updateOne({ _id: s.tenant._id }, { isActive: false });
    expect((await request(app).get('/api/public/tenant').set('Host', host(s.tenant.slug))).status).toBe(404);
  });
});

describe('signing in on a gym address', () => {
  const staffLogin = (hostName, email) => request(app).post('/api/auth/login').set('Host', hostName).send({ email, password: PASSWORD });

  it("lets a gym's own people in, with its brand in the response", async () => {
    const res = await staffLogin(host(a.tenant.slug), a.admin.email);
    expect(res.status).toBe(200);
    expect(res.body.brand).toMatchObject({ slug: a.tenant.slug, color: '#FF8A00' });
  });
  it("turns another gym's staff away with the ordinary wrong-password message", async () => {
    const res = await staffLogin(host(b.tenant.slug), a.admin.email);
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid credentials');
  });
  it('refuses sign-in on an address that belongs to no gym', async () => {
    expect((await staffLogin(host('no-such-gym'), a.admin.email)).status).toBe(401);
  });
  it('still lets people sign in on the main address, and lets platform staff in anywhere', async () => {
    expect((await staffLogin(BASE, a.admin.email)).status).toBe(200);
    expect((await staffLogin(host(a.tenant.slug), superAdmin.user.email)).status).toBe(200);
  });
  it("keeps a member to their own gym's address", async () => {
    const m = await createMember(a.managerToken, { branchId: a.branch._id.toString(), planId: a.plan._id.toString(), name: 'Addr Member', phone: '9500000001' });
    const access = await request(app).post(`/api/members/${m._id}/app-access`).set(auth(a.managerToken));
    const body = { identifier: access.body.memberCode, password: access.body.password };
    expect((await request(app).post('/api/member-auth/login').set('Host', host(b.tenant.slug)).send(body)).status).toBe(401);
    expect((await request(app).post('/api/member-auth/login').set('Host', host(a.tenant.slug)).send(body)).status).toBe(200);
  });
});

describe('branding and changing the address', () => {
  const put = (token, body, hostName = BASE) => request(app).put('/api/tenant-settings/branding').set('Host', hostName).set(auth(token)).send(body);

  it('shows the current settings to the tenant admin only', async () => {
    const res = await request(app).get('/api/tenant-settings/branding').set(auth(a.adminToken));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ slug: a.tenant.slug, baseDomain: BASE, canChangeAddress: false });
    expect((await request(app).get('/api/tenant-settings/branding').set(auth(a.managerToken))).status).toBe(403);
  });
  it('saves colour, logo and tagline, and rejects unsafe values', async () => {
    const ok = await put(a.adminToken, { color: '#22D3EE', logoUrl: 'https://cdn.example.com/logo.png', tagline: 'Strong together' });
    expect(ok.status).toBe(200);
    expect(ok.body.brand).toEqual({ color: '#22D3EE', color2: '', gradientAngle: 135, logoUrl: 'https://cdn.example.com/logo.png', tagline: 'Strong together' });
    const grad = await put(a.adminToken, { color2: '#c8f83a', gradientAngle: 90 });
    expect(grad.body.brand).toMatchObject({ color: '#22D3EE', color2: '#C8F83A', gradientAngle: 90 });
    expect((await put(a.adminToken, { color2: '#111111' })).status).toBe(400);
    expect((await put(a.adminToken, { gradientAngle: 45 })).status).toBe(400);
    // Clearing the start colour drops the gradient with it.
    expect((await put(a.adminToken, { color: '' })).body.brand).toMatchObject({ color: '', color2: '' });
    await put(a.adminToken, { color: '#22D3EE', color2: '' });
    expect((await put(a.adminToken, { logoUrl: 'http://insecure.example.com/x.png' })).status).toBe(400);
    expect((await put(a.adminToken, { logoUrl: 'https://x.example.com/a.png"onerror="x' })).status).toBe(400);
    expect((await put(a.adminToken, { color: '#111111' })).status).toBe(400);
    expect((await put(a.adminToken, { tagline: 'x'.repeat(81) })).status).toBe(400);
  });
  it('refuses an address change until the platform turns the feature on', async () => {
    const res = await put(a.adminToken, { slug: 'new-address-a' });
    expect(res.status).toBe(403);
  });

  describe('once enabled', () => {
    let oldSlug;
    beforeAll(async () => {
      oldSlug = a.tenant.slug;
      await Tenant.updateOne({ _id: a.tenant._id }, { 'features.features:customSubdomain': true });
    });

    it('rejects reserved, malformed and taken addresses', async () => {
      expect((await put(a.adminToken, { slug: 'admin' })).status).toBe(400);
      expect((await put(a.adminToken, { slug: 'Bad Name' })).status).toBe(400);
      const taken = await put(a.adminToken, { slug: b.tenant.slug });
      expect(taken.status).toBe(400);
      expect(taken.body.message).toMatch(/taken/);
    });
    it('renames, redirects the old address to the new one, and keeps old sessions working', async () => {
      const res = await put(a.adminToken, { slug: 'iron-hub-a' });
      expect(res.status).toBe(200);
      expect(res.body.slug).toBe('iron-hub-a');
      expect(res.body.previousAddresses.map((p) => p.slug)).toEqual([oldSlug]);

      const page = await request(app).get('/members?x=1').set('Host', host(oldSlug));
      expect(page.status).toBe(301);
      expect(page.headers.location).toBe(`http://iron-hub-a.${BASE}/members?x=1`);

      // API calls on the old address still resolve to the same gym (open sessions survive)
      const api = await request(app).get('/api/public/tenant').set('Host', host(oldSlug));
      expect(api.status).toBe(200);
      expect(api.body.slug).toBe('iron-hub-a');
      expect((await request(app).get('/api/public/tenant').set('Host', host('iron-hub-a'))).status).toBe(200);
    });
    it('does not let another gym take an address that is still redirecting', async () => {
      await Tenant.updateOne({ _id: b.tenant._id }, { 'features.features:customSubdomain': true });
      const res = await put(b.adminToken, { slug: oldSlug });
      expect(res.body.message).toMatch(/taken/);
      expect(res.status).toBe(400);
    });
    it('lets platform staff rename any gym, with the same checks', async () => {
      const ok = await request(app).put(`/api/tenants/${b.tenant._id}`).set(auth(superAdmin.token)).send({ slug: 'second-gym' });
      expect(ok.status).toBe(200);
      expect(ok.body.slug).toBe('second-gym');
      const bad = await request(app).put(`/api/tenants/${b.tenant._id}`).set(auth(superAdmin.token)).send({ slug: 'www' });
      expect(bad.status).toBe(400);
    });
    it('validates the address when a gym is created', async () => {
      const mk = (slug) => request(app).post('/api/tenants').set(auth(superAdmin.token)).send({
        name: 'New Gym', slug, contactEmail: 'new@example.com',
        admin: { name: 'N', email: `n-${slug}@example.com`, phone: '9000000009', password: 'Orchid-Lantern-47!' },
      });
      expect((await mk('api')).status).toBe(400);
      expect((await mk('second-gym')).status).toBe(409);
      expect((await mk('fresh-gym')).status).toBe(201);
    });
  });
});
