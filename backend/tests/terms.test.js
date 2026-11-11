const { app, request, connect, disconnect, uniq } = require('./helpers');
const User = require('../models/User');
const { TERMS_VERSION } = require('../utils/terms');

let saved;
beforeAll(async () => { await connect(); saved = process.env.TERMS_REQUIRED; process.env.TERMS_REQUIRED = 'on'; }, 90000);
afterAll(async () => { if (saved === undefined) delete process.env.TERMS_REQUIRED; else process.env.TERMS_REQUIRED = saved; await disconnect(); });

const body = (id, extra = {}) => ({ gymName: `Terms ${id} Fitness`, ownerName: 'Asha Owner', email: `owner-${id}@example.com`, phone: '9800002222', password: 'Orchid-Lantern-47!', ...extra });

describe('agreeing to the Terms of Service when registering', () => {
  it('is required: no ticked box, no gym', async () => {
    const id = uniq('t').toLowerCase();
    const res = await request(app).post('/api/public/signup').send(body(id));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TERMS_REQUIRED');
    expect((await request(app).post('/api/public/signup').send(body(id, { acceptTerms: false }))).status).toBe(400);
    expect(await User.exists({ email: `owner-${id}@example.com` })).toBeNull();
  });

  it('records which version was agreed to, and when', async () => {
    const id = uniq('t').toLowerCase();
    const res = await request(app).post('/api/public/signup').send(body(id, { acceptTerms: true }));
    expect(res.status).toBe(201);
    const owner = await User.findOne({ email: `owner-${id}@example.com` });
    expect(owner.termsVersion).toBe(TERMS_VERSION);
    expect(Date.now() - owner.termsAcceptedAt.getTime()).toBeLessThan(60000);
  });

  it('says nothing about whether the email already has an account', async () => {
    const id = uniq('t').toLowerCase();
    await request(app).post('/api/public/signup').send(body(id, { acceptTerms: true }));
    const again = await request(app).post('/api/public/signup').send(body(id)); // registered email, box not ticked
    expect(again.status).toBe(400);
    expect(again.body.code).toBe('TERMS_REQUIRED');
  });

  it('can be switched off by the operator', async () => {
    process.env.TERMS_REQUIRED = 'off';
    const id = uniq('t').toLowerCase();
    expect((await request(app).post('/api/public/signup').send(body(id))).status).toBe(201);
    process.env.TERMS_REQUIRED = 'on';
  });
});

describe('the public pages', () => {
  it('serves the Terms of Service without signing in, naming the operator from the environment', async () => {
    const saved = { name: process.env.TERMS_OPERATOR_NAME, law: process.env.TERMS_GOVERNING_LAW, mail: process.env.PRIVACY_CONTACT_EMAIL };
    process.env.TERMS_OPERATOR_NAME = 'Acme <Software> Pvt Ltd';
    process.env.TERMS_GOVERNING_LAW = 'Karnataka, India';
    process.env.PRIVACY_CONTACT_EMAIL = 'legal@example.com';
    const res = await request(app).get('/terms');
    Object.entries({ TERMS_OPERATOR_NAME: saved.name, TERMS_GOVERNING_LAW: saved.law, PRIVACY_CONTACT_EMAIL: saved.mail }).forEach(([k, v]) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('Terms of Service');
    expect(res.text).toContain('Acme &lt;Software&gt; Pvt Ltd'); // escaped, never raw HTML from a setting
    expect(res.text).toContain('Karnataka, India');
    expect(res.text).toContain('mailto:legal@example.com');
    expect(res.text).not.toMatch(/{{/); // every placeholder was filled
    expect(res.text).toContain('we do not receive, hold or settle'); // the UPI point is stated
  });

  it('is covered by the content-security policy, and the privacy page links to nothing broken', async () => {
    const csp = (await request(app).get('/terms')).headers['content-security-policy'] || '';
    // the page has one inline <style>; its hash must be allowed or browsers would strip its styling
    expect(csp).toMatch(/style-src[^;]*'sha256-/);
    expect((await request(app).get('/privacy')).status).toBe(200);
  });
});
