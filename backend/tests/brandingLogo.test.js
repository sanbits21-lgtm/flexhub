const { app, request, connect, disconnect, seedTenant, auth } = require('./helpers');
const Tenant = require('../models/Tenant');

// Display name, uploaded logo, and what the public brand tells the login page.

let a;
let b;

// Just enough of a PNG for the checks that read the header: signature, then an IHDR with the size.
const png = (w, h, extra = 0) => {
  const buf = Buffer.alloc(33 + extra);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12);
  buf.writeUInt32BE(w, 16);
  buf.writeUInt32BE(h, 20);
  return buf;
};
const b64 = (buf) => `data:image/png;base64,${buf.toString('base64')}`;

beforeAll(async () => {
  await connect();
  a = await seedTenant('logoa');
  b = await seedTenant('logob');
  await Tenant.updateMany({ _id: { $in: [a.tenant._id, b.tenant._id] } }, { $set: { 'features.features:branding': true } });
}, 120000);
afterAll(disconnect);

const putBrand = (token, body) => request(app).put('/api/tenant-settings/branding').set(auth(token)).send(body);
const putLogo = (token, image) => request(app).put('/api/tenant-settings/branding/logo').set(auth(token)).send({ image });

describe('the default identity', () => {
  it('is untouched until the gym sets its own name or logo', async () => {
    const res = await request(app).get('/api/tenant-settings/branding').set(auth(a.adminToken));
    expect(res.status).toBe(200);
    expect(res.body.public).toMatchObject({ customBrand: false, name: a.tenant.name, logoUrl: '' });
  });
});

describe('display name', () => {
  it('replaces the registered name in the public brand, and clearing it brings the name back', async () => {
    const set = await putBrand(a.adminToken, { displayName: '  Iron Temple  ' });
    expect(set.status).toBe(200);
    expect(set.body.public).toMatchObject({ name: 'Iron Temple', customBrand: true });
    const cleared = await putBrand(a.adminToken, { displayName: '' });
    expect(cleared.body.public).toMatchObject({ name: a.tenant.name, customBrand: false });
  });

  it('refuses a name over 40 characters', async () => {
    expect((await putBrand(a.adminToken, { displayName: 'x'.repeat(41) })).status).toBe(400);
  });
});

describe('logo upload', () => {
  it('stores a PNG, serves it publicly, and puts the served link in the brand', async () => {
    const up = await putLogo(a.adminToken, b64(png(256, 256)));
    expect(up.status).toBe(200);
    expect(up.body.brand.hasLogoFile).toBe(true);
    expect(up.body.public.logoUrl).toMatch(new RegExp(`^/api/public/logo/${a.tenant.slug}\\?v=`));
    expect(up.body.public.customBrand).toBe(true);
    const served = await request(app).get(up.body.public.logoUrl); // no sign-in: the login page needs it
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toBe('image/png');
  });

  it('refuses things that are not images, are too small or too large', async () => {
    expect((await putLogo(a.adminToken, `data:text/html;base64,${Buffer.from('<script>alert(1)</script>').toString('base64')}`)).status).toBe(400);
    expect((await putLogo(a.adminToken, b64(png(32, 32)))).status).toBe(400);
    expect((await putLogo(a.adminToken, b64(png(256, 256, 1024 * 1024)))).status).toBe(413);
  });

  it('only the owner can change it', async () => {
    expect((await putLogo(a.managerToken, b64(png(256, 256)))).status).toBe(403);
    expect((await putLogo(a.trainerToken, b64(png(256, 256)))).status).toBe(403);
  });

  it("another gym cannot read or remove this gym's logo through its own endpoints", async () => {
    const mine = await request(app).get(`/api/public/logo/${b.tenant.slug}`);
    expect(mine.status).toBe(404); // b never uploaded one, and a's logo is not served under b's name
    await request(app).delete('/api/tenant-settings/branding/logo').set(auth(b.adminToken));
    const still = await request(app).get('/api/tenant-settings/branding').set(auth(a.adminToken));
    expect(still.body.brand.hasLogoFile).toBe(true);
  });

  it('removing it returns the gym to the default identity', async () => {
    const res = await request(app).delete('/api/tenant-settings/branding/logo').set(auth(a.adminToken));
    expect(res.status).toBe(200);
    expect(res.body.public).toMatchObject({ customBrand: false, logoUrl: '' });
    expect((await request(app).get(`/api/public/logo/${a.tenant.slug}`)).status).toBe(404);
  });
});
