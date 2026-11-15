const { app, request, connect, disconnect, seedTenant, createSuperAdmin, auth } = require('./helpers');
const PlatformSettings = require('../models/PlatformSettings');
const Tenant = require('../models/Tenant');
const AuditLog = require('../models/AuditLog');

// The member app's web address: the gym's own, else the platform's ({slug} allowed), else the automatic one.

let t; let other; let su;
const saved = {};
const link = (token) => request(app).get('/api/tenant-settings/member-app-link').set(auth(token));
const setGym = (token, url) => request(app).put('/api/tenant-settings/member-app-link').set(auth(token)).send({ url });
const setPlatform = (memberAppUrl) => request(app).put('/api/platform-settings').set(auth(su.token)).send({ memberAppUrl });

beforeAll(async () => {
  await connect();
  await PlatformSettings.deleteMany({});
  su = await createSuperAdmin();
  t = await seedTenant('addr');
  other = await seedTenant('addrother');
}, 120000);
afterAll(async () => { await PlatformSettings.deleteMany({}); await disconnect(); });
beforeEach(async () => {
  ['BASE_DOMAIN', 'PUBLIC_URL'].forEach((k) => { saved[k] = process.env[k]; delete process.env[k]; });
  process.env.PUBLIC_URL = 'https://auto.example.com';
  await PlatformSettings.deleteMany({});
  await Tenant.updateMany({ _id: { $in: [t.tenant._id, other.tenant._id] } }, { $set: { memberAppUrl: '' } });
});
afterEach(() => { ['BASE_DOMAIN', 'PUBLIC_URL'].forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }); });

describe('which address wins', () => {
  it('starts automatic, from the environment', async () => {
    const res = (await link(t.adminToken)).body;
    expect(res).toMatchObject({ url: 'https://auto.example.com/member', source: 'automatic', custom: '', platform: '' });
  });

  it('the platform-wide address replaces the automatic one, and {slug} becomes each gym own name', async () => {
    expect((await setPlatform('https://{slug}.members.example.com/member')).status).toBe(200);
    const a = (await link(t.adminToken)).body;
    const b = (await link(other.adminToken)).body;
    expect(a).toMatchObject({ url: `https://${t.tenant.slug}.members.example.com/member`, source: 'platform' });
    expect(b.url).toBe(`https://${other.tenant.slug}.members.example.com/member`);
    // and a single shared address for every gym works too
    await setPlatform('https://fitzyclub.example.com/member');
    expect((await link(t.adminToken)).body.url).toBe('https://fitzyclub.example.com/member');
    expect((await link(other.adminToken)).body.url).toBe('https://fitzyclub.example.com/member');
  });

  it('the gym own address beats the platform one, only for that gym, and clearing it goes back', async () => {
    await setPlatform('https://fitzyclub.example.com/member');
    const set = await setGym(t.adminToken, 'https://go.irontemple.in/join');
    expect(set.status).toBe(200);
    expect(set.body).toMatchObject({ url: 'https://go.irontemple.in/join', source: 'gym', custom: 'https://go.irontemple.in/join', platform: 'https://fitzyclub.example.com/member' });
    expect((await link(other.adminToken)).body.url).toBe('https://fitzyclub.example.com/member'); // another gym is unaffected
    const cleared = await setGym(t.adminToken, '');
    expect(cleared.body).toMatchObject({ url: 'https://fitzyclub.example.com/member', source: 'platform', custom: '' });
  });

  it('the subdomain scheme is still the automatic answer when nothing is set', async () => {
    process.env.BASE_DOMAIN = 'example.test';
    const res = (await link(t.adminToken)).body;
    expect(res.source).toBe('automatic');
    expect(res.url.replace(/:\d+(?=\/member$)/, '')).toBe(`http://${t.tenant.slug}.example.test/member`);
  });
});

describe('what may be set', () => {
  const bad = ['javascript:alert(1)', 'http://irontemple.in/join', 'ftp://x.example.com', 'irontemple.in', 'https://user:pass@irontemple.in', 'https://iron temple.in', `https://x.example.com/${'a'.repeat(300)}`, 'https://{slug}.irontemple.in', 'data:text/html,hi'];
  it.each(bad.map((b) => [b.length > 60 ? `${b.slice(0, 40)}...` : b, b]))('the gym refuses %s', async (_label, url) => {
    expect((await setGym(t.adminToken, url)).status).toBe(400);
    expect((await Tenant.findById(t.tenant._id)).memberAppUrl).toBe('');
  });

  it('the platform refuses unsafe addresses and unknown placeholders too, but accepts {slug}', async () => {
    for (const url of ['javascript:alert(1)', 'http://example.com', 'https://{name}.example.com', 'https://x.example.com/{slug']) {
      expect((await setPlatform(url)).status).toBe(400);
    }
    expect((await setPlatform('https://{slug}.example.com/member')).status).toBe(200);
    expect((await setPlatform('')).status).toBe(200); // clearing is fine
  });

  it('allows plain http only for a local test server', async () => {
    expect((await setGym(t.adminToken, 'http://localhost:5173/member')).status).toBe(200);
  });
});

describe('who may change it', () => {
  it('the gym owner sets the gym address; managers and trainers can read it but not change it', async () => {
    expect((await setGym(t.managerToken, 'https://x.example.com')).status).toBe(403);
    expect((await setGym(t.trainerToken, 'https://x.example.com')).status).toBe(403);
    expect((await request(app).put('/api/tenant-settings/member-app-link').send({ url: 'https://x.example.com' })).status).toBe(401);
    expect((await link(t.managerToken)).status).toBe(200);
  });

  it('only the super-admin sets the platform-wide address', async () => {
    expect((await request(app).put('/api/platform-settings').set(auth(t.adminToken)).send({ memberAppUrl: 'https://x.example.com' })).status).toBe(403);
  });

  it('one gym cannot change the address of another', async () => {
    await setGym(other.adminToken, 'https://theirs.example.com');
    expect((await Tenant.findById(t.tenant._id)).memberAppUrl).toBe('');
    expect((await link(t.adminToken)).body.url).not.toContain('theirs');
  });

  it('the change is written to the audit log', async () => {
    await setGym(t.adminToken, 'https://go.irontemple.in/join');
    expect(await AuditLog.countDocuments({ action: 'UPDATE_MEMBER_APP_ADDRESS', targetId: t.tenant._id })).toBeGreaterThan(0);
  });
});
