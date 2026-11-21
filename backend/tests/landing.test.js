const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { app, request, connect, disconnect, seedTenant } = require('./helpers');

const dir = path.join(__dirname, '../public/landing');
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const BASE = 'landing-test.example';

let t;
beforeAll(async () => { process.env.BASE_DOMAIN = BASE; await connect(); t = await seedTenant('landing'); }, 120000);
afterAll(async () => { delete process.env.BASE_DOMAIN; await disconnect(); });

describe('the landing page is the front door of the main address only', () => {
  it('serves at the root of the main address, with the video-friendly headers', async () => {
    const res = await request(app).get('/').set('Host', BASE);
    expect(res.status).toBe(200);
    expect(res.type).toBe('text/html');
    expect(res.text).toContain('Run your whole gym from one app');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    const csp = res.headers['content-security-policy'] || '';
    expect(csp).toMatch(/frame-src https:\/\/www\.youtube-nocookie\.com/);
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval/);
  });

  it("a gym's own address does not show it", async () => {
    const res = await request(app).get('/').set('Host', `${t.tenant.slug}.${BASE}`);
    expect(res.text || '').not.toContain('Run your whole gym from one app');
    const unknown = await request(app).get('/').set('Host', `nobody-here.${BASE}`);
    expect(unknown.text || '').not.toContain('Run your whole gym from one app');
  });

  it('search engines may index the main address but not a gym address or the app', async () => {
    const main = await request(app).get('/robots.txt').set('Host', BASE);
    expect(main.text).toMatch(/Allow: \/\$/);
    expect(main.text).toMatch(/Disallow: \/api\//);
    expect(main.text).toMatch(/Sitemap: .*\/sitemap\.xml/);
    const gym = await request(app).get('/robots.txt').set('Host', `${t.tenant.slug}.${BASE}`);
    expect(gym.text).toMatch(/Disallow: \/\n/);
    expect((await request(app).get('/sitemap.xml').set('Host', BASE)).text).toContain('<loc>');
    expect((await request(app).get('/sitemap.xml').set('Host', `${t.tenant.slug}.${BASE}`)).status).toBe(404);
  });

  it('serves its files, and the page that edits content is never cached stale', async () => {
    for (const f of ['landing.css', 'landing.js', 'redirect.js', 'icons.svg', 'img/dashboard.jpg', 'img/member-app.jpg', 'img/welcome-card.jpg']) {
      const res = await request(app).get(`/landing/${f}`).set('Host', BASE);
      expect(res.status).toBe(200);
    }
    expect((await request(app).get('/landing/config.js').set('Host', BASE)).headers['cache-control']).toBe('no-cache');
    expect((await request(app).get('/landing/')).status).not.toBe(200); // no directory listing
  });
});

describe('what the page is made of', () => {
  const html = read('index.html');

  it('ships no invented content: every part you must fill in starts empty and hidden', () => {
    const sandbox = { window: {} };
    vm.runInNewContext(read('config.js'), sandbox);
    const c = sandbox.window.FITZY_LANDING;
    expect(c.testimonials).toEqual([]);
    expect(c.stats).toEqual([]);
    expect(c.videos.main).toBe('');
    expect(c.videos.more).toEqual([]);
    expect(Object.values(c.social).every((v) => v === '')).toBe(true);
    expect(c.whatsapp).toBe('');
    expect(c.email).toBe('');
    for (const id of ['proof', 'demo', 'stories']) expect(html).toMatch(new RegExp(`<section[^>]*id="${id}"[^>]*hidden`));
  });

  it('only talks to the places the security policy allows', () => {
    const all = `${html}\n${read('landing.js')}\n${read('landing.css')}`;
    const hosts = new Set([...all.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1].toLowerCase()));
    const allowed = ['schema.org', 'www.w3.org', 'wa.me', 'i.ytimg.com', 'www.youtube-nocookie.com'];
    for (const h of hosts) expect(allowed).toContain(h);
  });

  it('every icon it uses exists in the sprite', () => {
    const sprite = read('icons.svg');
    const used = new Set([...`${html}\n${read('landing.js')}`.matchAll(/icons\.svg#([a-z-]+)/g)].map((m) => m[1]));
    // landing.js builds some names at run time from a table
    ['youtube', 'instagram', 'facebook', 'linkedin', 'twitter', 'mail'].forEach((n) => used.add(n));
    for (const id of used) expect(sprite).toContain(`id="${id}"`);
  });

  it('every image and in-page link it points to exists', () => {
    for (const m of html.matchAll(/(?:src|href)="\/landing\/(img\/[^"]+)"/g)) expect(fs.existsSync(path.join(dir, m[1]))).toBe(true);
    for (const m of html.matchAll(/href="#([a-z-]+)"/g)) expect(html).toMatch(new RegExp(`id="${m[1]}"`));
  });

  it('has one main heading, a title, a description, and a way to skip to the content', () => {
    expect((html.match(/<h1[ >]/g) || []).length).toBe(1);
    expect(html).toMatch(/<title>[^<]{10,}<\/title>/);
    expect(html).toMatch(/<meta name="description" content="[^"]{50,}/);
    expect(html).toMatch(/class="skip" href="#main"/);
    expect(html).toMatch(/<main id="main">/);
  });

  it('the sign-up buttons all go to the real sign-up page', () => {
    const ctas = [...html.matchAll(/<a class="btn[^"]*" href="([^"]+)"[^>]*data-cta/g)].map((m) => m[1]);
    expect(ctas.length).toBeGreaterThanOrEqual(4);
    ctas.forEach((href) => expect(href).toBe('/signup'));
  });
});
