const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, request } = require('./helpers');
const { inlineHashes, buildDirectives, sha } = require('../middleware/csp');

const hashOf = (text) => `'sha256-${crypto.createHash('sha256').update(text, 'utf8').digest('base64')}'`;

describe('finding the inline code to allow', () => {
  it('hashes inline scripts and styles exactly, and ignores external and empty ones', () => {
    const html = `<html><head>
      <script>var a = 1;</script>
      <script type="module" crossorigin src="/assets/app.js"></script>
      <script src="/x.js">ignored text</script>
      <script>   </script>
      <style>body { color: red }</style>
      <link rel="stylesheet" href="/a.css">
    </head></html>`;
    const found = inlineHashes(html);
    expect(found.scripts).toEqual([hashOf('var a = 1;')]);
    expect(found.styles).toEqual([hashOf('body { color: red }')]);
    expect(sha('x')).toBe(hashOf('x'));
  });

  it("the hash covers the block's whitespace, as browsers compute it", () => {
    const body = '\n      (function () { return 1; })();\n    ';
    expect(inlineHashes(`<script>${body}</script>`).scripts).toEqual([hashOf(body)]);
  });
});

describe('the directives', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-'));
  const page = path.join(dir, 'index.html');
  const other = path.join(dir, 'privacy.html');
  fs.writeFileSync(page, '<script>theme()</script><script type="module" src="/a.js"></script>');
  fs.writeFileSync(other, '<style>p{margin:0}</style>');
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('allow own files plus only the hashed inline blocks, never blanket inline or eval', () => {
    const d = buildDirectives([page, other, path.join(dir, 'missing.html')]);
    expect(d.scriptSrc).toEqual(["'self'", hashOf('theme()')]);
    expect(d.styleSrc).toEqual(["'self'", hashOf('p{margin:0}')]);
    for (const list of [d.scriptSrc, d.styleSrc, d.defaultSrc]) {
      expect(list).not.toContain("'unsafe-inline'");
      expect(list).not.toContain("'unsafe-eval'");
    }
  });

  it('lock down everything the site does not use', () => {
    const d = buildDirectives([]);
    expect(d.objectSrc).toEqual(["'none'"]);
    expect(d.frameSrc).toEqual(["'none'"]);
    expect(d.frameAncestors).toEqual(["'none'"]);
    expect(d.baseUri).toEqual(["'self'"]);
    expect(d.formAction).toEqual(["'self'"]);
    expect(d.connectSrc).toEqual(["'self'"]);
    expect(d.reportUri).toEqual(['/api/csp-report']);
  });
});

describe('the header the server sends', () => {
  it('is on every response, including the API', async () => {
    const res = await request(app).get('/api/public/signup-config');
    const policy = res.headers['content-security-policy'];
    expect(policy).toMatch(/default-src 'self'/);
    expect(policy).toMatch(/object-src 'none'/);
    expect(policy).toMatch(/frame-ancestors 'none'/);
    expect(policy).toMatch(/report-uri \/api\/csp-report/);
    const scriptSrc = policy.split(';').find((d) => d.trim().startsWith('script-src'));
    expect(scriptSrc).not.toMatch(/unsafe-inline|unsafe-eval/);
    expect(res.headers['content-security-policy-report-only']).toBeUndefined();
  });

  it("allows the built site's own inline theme script by hash (when the site has been built)", async () => {
    const built = path.join(__dirname, '../../frontend/dist/index.html');
    if (!fs.existsSync(built)) return;
    const wanted = inlineHashes(fs.readFileSync(built, 'utf8')).scripts;
    const policy = (await request(app).get('/api/public/signup-config')).headers['content-security-policy'];
    for (const h of wanted) expect(policy).toContain(h);
  });
});

describe('the other modes', () => {
  // The mode is read when the middleware is built, which is when the server starts.
  const load = (mode) => {
    process.env.CSP_MODE = mode;
    try { return require('../middleware/csp').csp(); } finally { delete process.env.CSP_MODE; }
  };
  const run = (mw) => { const headers = {}; mw({}, { setHeader: (k, v) => { headers[k.toLowerCase()] = v; }, getHeader: () => undefined }, () => {}); return headers; };

  it('report-only logs violations without blocking', () => {
    const h = run(load('report-only'));
    expect(h['content-security-policy-report-only']).toMatch(/default-src 'self'/);
    expect(h['content-security-policy']).toBeUndefined();
  });

  it('off sends nothing, and an unknown value falls back to enforcing', () => {
    expect(run(load('off'))).toEqual({});
    expect(run(load('nonsense'))['content-security-policy']).toMatch(/default-src 'self'/);
  });
});

describe('violation reports', () => {
  it('are accepted without signing in, in both browser formats, and answer 204', async () => {
    const legacy = await request(app).post('/api/csp-report').set('Content-Type', 'application/csp-report')
      .send(JSON.stringify({ 'csp-report': { 'blocked-uri': 'https://evil.example/x.js', 'violated-directive': 'script-src', 'document-uri': 'https://app/' } }));
    expect(legacy.status).toBe(204);
    const modern = await request(app).post('/api/csp-report').set('Content-Type', 'application/reports+json')
      .send(JSON.stringify([{ type: 'csp-violation', body: { blockedURL: 'inline', effectiveDirective: 'script-src' } }]));
    expect(modern.status).toBe(204);
    expect((await request(app).post('/api/csp-report').send({ anything: 1 })).status).toBe(204);
  });

  it('refuse a large body', async () => {
    const res = await request(app).post('/api/csp-report').set('Content-Type', 'application/csp-report').send('x'.repeat(50 * 1024));
    expect(res.status).toBe(413);
  });
});
