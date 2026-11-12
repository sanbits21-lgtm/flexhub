const { app, request, connect, disconnect, seedTenant, createMember, auth } = require('./helpers');
const Tenant = require('../models/Tenant');

const BASE = 'gym.test';
let A;
let member;
let creds;

beforeAll(async () => {
  await connect();
  process.env.BASE_DOMAIN = BASE;
  A = await seedTenant('pwa');
  await Tenant.updateOne({ _id: A.tenant._id }, { 'brand.color': '#FF8A00', 'brand.tagline': 'Lift.' });
  member = await createMember(A.managerToken, { branchId: A.branch._id.toString(), planId: A.plan._id.toString(), name: 'Pwa Member', phone: '9100000123' });
  creds = (await request(app).post(`/api/members/${member._id}/app-access`).set(auth(A.managerToken))).body;
}, 120000);
afterAll(async () => { delete process.env.BASE_DOMAIN; await disconnect(); });

describe('member app manifest', () => {
  it('is generic on the main address', async () => {
    const res = await request(app).get('/member.webmanifest').set('Host', BASE);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/manifest\+json/);
    expect(res.body).toMatchObject({ id: '/member', name: 'FitzyClub Member', short_name: 'FitzyClub', start_url: '/member', scope: '/member', display: 'standalone', theme_color: '#0A0C10' });
    expect(res.body.icons.map((i) => i.sizes)).toEqual(['192x192', '512x512', '512x512']);
  });

  it("carries the gym's name and colour on its own address", async () => {
    const res = await request(app).get('/member.webmanifest').set('Host', `${A.tenant.slug}.${BASE}`);
    expect(res.body.name).toBe('pwa Gym Member');
    expect(res.body.short_name).toBe('pwa Gym');
    expect(res.body.theme_color).toBe('#FF8A00');
  });

  it('keeps a long gym name short enough for a home-screen label', async () => {
    await Tenant.updateOne({ _id: A.tenant._id }, { name: 'The Very Long Gym Name Fitness Club' });
    const res = await request(app).get('/member.webmanifest').set('Host', `${A.tenant.slug}.${BASE}`);
    expect(res.body.short_name.length).toBeLessThanOrEqual(12);
    await Tenant.updateOne({ _id: A.tenant._id }, { name: 'pwa Gym' });
  });
});

describe("the member's sign-in carries the gym's look", () => {
  it('returns the brand with the login and with /me', async () => {
    const login = await request(app).post('/api/member-auth/login').send({ identifier: creds.memberCode, password: creds.password });
    expect(login.status).toBe(200);
    expect(login.body.brand).toMatchObject({ name: 'pwa Gym', color: '#FF8A00', tagline: 'Lift.' });
    const me = await request(app).get('/api/member-auth/me').set(auth(login.body.token));
    expect(me.body.brand).toMatchObject({ color: '#FF8A00' });
    expect(me.body.member.customFields).toBeUndefined();
  });
});
