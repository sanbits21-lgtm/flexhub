const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');

// Content-Security-Policy: the browser refuses to run script, or load things, from anywhere the
// policy does not name. If an attacker ever got a <script> into a page (the one thing that could
// otherwise read a signed-in session), the browser would not run it.
//
// The site is a built single-page app: every script and style is a file served from this origin,
// except ONE small inline script in index.html (it sets dark mode before first paint, to avoid a
// white flash) and one inline <style> in the privacy page. Instead of allowing all inline code,
// those exact blocks are allowed by their SHA-256 hash, computed here from the files at start-up,
// so a changed block is picked up by a restart and nothing else inline can run.
//
// CSP_MODE: enforce (default) | report-only (log violations, block nothing) | off.

const sha = (text) => `'sha256-${crypto.createHash('sha256').update(text, 'utf8').digest('base64')}'`;

/** Hashes of the inline <script> and <style> blocks of an HTML document (blocks with a src, or empty ones, have nothing to allow). */
const inlineHashes = (html) => {
  const find = (tag) => [...html.matchAll(new RegExp(`<${tag}(\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'gi'))]
    .filter((m) => !/\ssrc\s*=/i.test(m[1] || '') && m[2].trim() !== '')
    .map((m) => sha(m[2]));
  return { scripts: find('script'), styles: find('style') };
};

const read = (file) => { try { return fs.readFileSync(file, 'utf8'); } catch { return ''; } };

/** The directives. `htmlFiles` are the pages whose inline blocks are allowed. */
const buildDirectives = (htmlFiles) => {
  const scripts = []; const styles = [];
  for (const file of htmlFiles) {
    const found = inlineHashes(read(file));
    scripts.push(...found.scripts);
    styles.push(...found.styles);
  }
  return {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", ...new Set(scripts)],
    // React sets styles through the DOM, which a policy does not restrict; only <style> blocks and
    // style="" written in HTML are, and the only such block is hashed.
    styleSrc: ["'self'", ...new Set(styles)],
    // https: because a gym can show its logo from any https address; data:/blob: for QR codes,
    // receipts and member photos fetched through the API.
    imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
    fontSrc: ["'self'", 'data:'],
    connectSrc: ["'self'"],
    manifestSrc: ["'self'"],
    workerSrc: ["'self'"],
    mediaSrc: ["'self'", 'blob:'],
    frameSrc: ["'none'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
    reportUri: ['/api/csp-report'],
  };
};

const mode = () => {
  const m = String(process.env.CSP_MODE || 'enforce').toLowerCase();
  return ['enforce', 'report-only', 'off'].includes(m) ? m : 'enforce';
};

/** The middleware to mount; a no-op when switched off. */
const csp = () => {
  if (mode() === 'off') return (req, res, next) => next();
  const frontendDist = path.join(__dirname, '../../frontend/dist');
  const directives = buildDirectives([path.join(frontendDist, 'index.html'), path.join(__dirname, '../public/privacy.html')]);
  return helmet.contentSecurityPolicy({ useDefaults: false, directives, reportOnly: mode() === 'report-only' });
};

// Browsers POST a small JSON report whenever the policy blocks (or, in report-only mode, would
// block) something. It is unauthenticated input, so it is size-limited, never trusted, and only
// a short summary is logged: this is how a policy problem in production becomes visible.
const reportBody = require('express').json({ type: ['application/csp-report', 'application/reports+json', 'application/json'], limit: '10kb' });
const report = (req, res) => {
  const body = Array.isArray(req.body) ? req.body[0]?.body : req.body?.['csp-report'] || req.body;
  if (process.env.NODE_ENV !== 'test' && body && typeof body === 'object') {
    const pick = (k) => String(body[k] ?? '').slice(0, 120);
    console.warn(`[csp] blocked ${pick('blocked-uri') || pick('blockedURL')} by ${pick('violated-directive') || pick('effectiveDirective')} on ${pick('document-uri') || pick('documentURL')}`);
  }
  res.status(204).end();
};

module.exports = { csp, inlineHashes, buildDirectives, sha, reportBody, report };
