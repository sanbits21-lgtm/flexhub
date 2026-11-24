const { app, request, connect, disconnect, seedTenant } = require('./helpers');
const Tenant = require('../models/Tenant');

// The reverse proxy fetches an HTTPS certificate for a gym's address the first time it is visited, but only after asking the app.
const BASE = 'tls-test.example';
let gym;

beforeAll(async () => {
  process.env.BASE_DOMAIN = BASE;
  process.env.PUBLIC_URL = `https://${BASE}`;
  await connect();
  gym = await seedTenant('tlsgym');
}, 120000);
afterAll(async () => { delete process.env.BASE_DOMAIN; delete process.env.PUBLIC_URL; await disconnect(); });

const ask = (domain, headers = {}) => request(app).get('/internal/tls-ask').query({ domain }).set(headers);

describe('which names may get a certificate', () => {
  it('the main address and the base domain', async () => {
    expect((await ask(BASE)).status).toBe(200);
    expect((await ask(BASE.toUpperCase())).status).toBe(200);
    expect((await ask(`${BASE}.`)).status).toBe(200); // a trailing dot is the same name
  });

  it("a gym's own address, and nothing else around it", async () => {
    expect((await ask(`${gym.tenant.slug}.${BASE}`)).status).toBe(200);
    expect((await ask(`nobody-here.${BASE}`)).status).toBe(404);
    expect((await ask(`${gym.tenant.slug}.other.example`)).status).toBe(404); // right label, wrong domain
    expect((await ask(`x.${gym.tenant.slug}.${BASE}`)).status).toBe(404); // two levels deep
    expect((await ask(`${gym.tenant.slug}${BASE}`)).status).toBe(404); // no dot
  });

  it('never for reserved names, other domains, or nonsense', async () => {
    for (const d of [`www.${BASE}`, `api.${BASE}`, `admin.${BASE}`, 'example.com', 'localhost', '', 'a b.example', `${'a'.repeat(300)}.${BASE}`, `ex%61mple.${BASE}`]) {
      expect((await ask(d)).status).toBe(404);
    }
    expect((await request(app).get('/internal/tls-ask')).status).toBe(404); // no domain at all
  });

  it('an address a gym has just renamed away from still works while it redirects, then stops', async () => {
    await Tenant.updateOne({ _id: gym.tenant._id }, { $set: { previousSlugs: [{ slug: 'old-name', until: new Date(Date.now() + 86400000) }, { slug: 'long-gone', until: new Date(Date.now() - 86400000) }] } });
    expect((await ask(`old-name.${BASE}`)).status).toBe(200);
    expect((await ask(`long-gone.${BASE}`)).status).toBe(404);
  });

  it('says nothing but a status code, and is closed to anything that came through the proxy', async () => {
    const yes = await ask(`${gym.tenant.slug}.${BASE}`);
    expect(yes.text).toBe('');
    expect((await ask(`${gym.tenant.slug}.${BASE}`, { 'X-Forwarded-For': '203.0.113.9' })).status).toBe(404);
  });
});

describe('without a base domain set (a single address)', () => {
  it('only the public address is allowed', async () => {
    delete process.env.BASE_DOMAIN;
    try {
      expect((await ask(BASE)).status).toBe(200);
      expect((await ask(`${gym.tenant.slug}.${BASE}`)).status).toBe(404);
    } finally { process.env.BASE_DOMAIN = BASE; }
  });
});
