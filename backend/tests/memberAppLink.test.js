const { app, request, connect, disconnect, seedTenant, auth } = require('./helpers');

let t;
const saved = {};
beforeAll(async () => { await connect(); t = await seedTenant('qrlink'); }, 90000);
afterAll(disconnect);
afterEach(() => {
  ['BASE_DOMAIN', 'PUBLIC_URL'].forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; });
});
beforeEach(() => { ['BASE_DOMAIN', 'PUBLIC_URL'].forEach((k) => { saved[k] = process.env[k]; delete process.env[k]; }); });

const link = (token) => request(app).get('/api/tenant-settings/member-app-link').set(auth(token));

describe('the member app link behind the front-desk QR code', () => {
  it('points at /member on the main site, using PUBLIC_URL when it is set', async () => {
    process.env.PUBLIC_URL = 'https://app.example.com/';
    const res = await link(t.adminToken);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ url: 'https://app.example.com/member', gymName: t.tenant.name });
  });

  it('uses the gym\'s own address when subdomains are on', async () => {
    process.env.BASE_DOMAIN = 'example.test';
    process.env.PUBLIC_URL = 'https://app.example.test';
    const res = await link(t.managerToken);
    // protocol and port follow the request (plain http on a test server), as with the login link
    expect(res.body.url.replace(/:\d+(?=\/member$)/, '')).toBe(`http://${t.tenant.slug}.example.test/member`);
  });

  it('is for the owner and the branch manager, not for trainers or signed-out visitors', async () => {
    expect((await link(t.managerToken)).status).toBe(200);
    expect((await link(t.trainerToken)).status).toBe(403);
    expect((await request(app).get('/api/tenant-settings/member-app-link')).status).toBe(401);
  });

  it('gives each gym its own link', async () => {
    process.env.BASE_DOMAIN = 'example.test';
    const other = await seedTenant('qrlink-other');
    expect((await link(other.adminToken)).body.url.replace(/:\d+(?=\/member$)/, '')).toBe(`http://${other.tenant.slug}.example.test/member`);
  });
});
