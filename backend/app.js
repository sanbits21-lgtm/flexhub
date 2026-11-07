const path = require('path');
const express = require('express');
require('express-async-errors');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const memberAuthRoutes = require('./routes/memberAuth');
const platformAdminRoutes = require('./routes/platformAdmins');
const tenantRoutes = require('./routes/tenants');
const branchRoutes = require('./routes/branches');
const staffRoutes = require('./routes/staff');
const memberRoutes = require('./routes/members');
const equipmentRoutes = require('./routes/equipment');
const membershipPlanRoutes = require('./routes/membershipPlans');
const attendanceRoutes = require('./routes/attendance');
const paymentRoutes = require('./routes/payments');
const dashboardRoutes = require('./routes/dashboard');
const auditLogRoutes = require('./routes/auditLogs');
const reportRoutes = require('./routes/reports');
const tenantSettingsRoutes = require('./routes/tenantSettings');
const classTypeRoutes = require('./routes/classTypes');
const classSessionRoutes = require('./routes/classSessions');
const bookingRoutes = require('./routes/bookings');
const memberAppRoutes = require('./routes/memberApp');
const ptSessionRoutes = require('./routes/ptSessions');

const app = express();

// Behind a reverse proxy (Render/Railway/Fly/nginx, etc.) in production, so req.ip
// reflects the real client for rate limiting instead of the proxy's own address.
// TRUST_PROXY = how many proxies sit in front of the app (1 for Render or Caddy). Too low and
// every visitor shares the proxy's address, which breaks rate limiting; too high lets a client
// spoof its address with a forged X-Forwarded-For header.
const trustProxyHops = Number.isInteger(Number(process.env.TRUST_PROXY)) && process.env.TRUST_PROXY !== '' ? Number(process.env.TRUST_PROXY) : 1;
app.set('trust proxy', trustProxyHops);

// CSP is off by default: helmet's default policy is tuned for server-rendered HTML and
// will need real tuning against the built Vite bundle (hashed asset URLs, etc.) once this
// is actually deployed and testable in a browser — shipping an untested CSP risks a
// silent white-screen in production. The other headers (HSTS, X-Frame-Options,
// X-Content-Type-Options, etc.) are safe, non-breaking defaults and stay on.
app.use(helmet({ contentSecurityPolicy: false }));

// CORS_ORIGIN is a comma-separated allow-list (e.g. "https://app.example.com").
// Unset in development = allow any origin, for convenience with the Vite dev server.
// Unset in production = same-origin only (safe default when the backend also serves
// the built frontend, per the static-file block below); explicit origins are only
// required when the frontend is hosted on a different domain than the API.
const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors({
  origin: allowedOrigins.length
    ? allowedOrigins
    : (process.env.NODE_ENV === 'production' ? false : true),
}));

// A request body is read before anyone is authenticated, so the default is small. Only a bulk
// member import (hundreds of rows) and a profile photo (base64, up to 1 MB) need more.
const bigBody = express.json({ limit: '5mb' });
const smallBody = express.json({ limit: '100kb' });
app.use((req, res, next) => (/^\/api\/(members\/bulk|member-app\/me\/photo)/.test(req.path) ? bigBody : smallBody)(req, res, next));

// Which gym is this address? (iron.example.com). Before static files so a renamed gym's old
// address can redirect to the new one.
app.use(require('./middleware/tenantHost'));

// Rate limiting is skipped under test: the suite fires hundreds of requests from one
// address, including deliberate bad logins, and would otherwise trip its own limiter.
// (test/rateLimit.test.js switches it back on.) It MUST be mounted before the public routes:
// a route that answers first never reaches a limiter that comes after it, which is how the
// sign-up limits once sat there doing nothing.
if (process.env.NODE_ENV !== 'test' || process.env.FORCE_RATE_LIMIT === 'on') {
  // Generous ceiling on the whole API — defends against accidental/abusive floods
  // without getting in normal users' way.
  app.use('/api', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  }));

  // Tighter limit specifically on the two login endpoints — the actual brute-force
  // protection. Doesn't count successful logins against the limit.
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { message: 'Too many login attempts. Try again later.' },
  });
  // Each signup creates a gym, a branch and an account, so it is limited much harder.
  app.use('/api/public/signup', rateLimit({
    windowMs: 60 * 60 * 1000,
    max: Number(process.env.SIGNUP_PER_HOUR) || 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many sign-ups from this network. Please try again later.' },
  }));
  app.use(['/api/public/verify-email', '/api/public/resend-verification'], rateLimit({
    windowMs: 60 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
    message: { message: 'Too many attempts. Please try again later.' },
  }));
  app.use('/api/auth/login', loginLimiter);
  app.use('/api/member-auth/login', loginLimiter);
}

app.use('/api/public', require('./routes/public'));

app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

app.use('/api/auth', authRoutes);
app.use('/api/member-auth', memberAuthRoutes);
app.use('/api/platform-admins', platformAdminRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/platform-settings', require('./routes/platformSettings'));
app.use('/api/packages', require('./routes/packages'));
app.use('/api/branches', branchRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/equipment', equipmentRoutes);
app.use('/api/membership-plans', membershipPlanRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/tenant-settings', tenantSettingsRoutes);
app.use('/api/class-types', classTypeRoutes);
app.use('/api/class-sessions', classSessionRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/member-app', memberAppRoutes);
app.use('/api/pt-sessions', ptSessionRoutes);

// Single-service deployment: serve the built frontend from this same process when
// present, so the whole app is one Node service (no separate static host needed, and
// no CORS setup required since frontend + API share an origin). No-op locally, where
// frontend/dist doesn't exist and Vite's own dev server is used instead.
// Public privacy policy: the app stores require a URL that loads without signing in.
// Operator and contact come from the environment so each deployment names itself.
const escapeHtml = (v) => String(v).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
app.get('/privacy', (req, res, next) => {
  require('fs').readFile(path.join(__dirname, 'public/privacy.html'), 'utf8', (err, html) => {
    if (err) return next(err);
    const email = process.env.PRIVACY_CONTACT_EMAIL;
    const contact = email ? `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>` : 'your gym';
    res.type('html').send(html
      .replace(/{{OPERATOR}}/g, escapeHtml(process.env.PRIVACY_OPERATOR_NAME || 'the gym that gave you your login'))
      .replace(/{{CONTACT}}/g, contact)
      .replace(/{{UPDATED}}/g, '2 November 2026'));
  });
});

// The member app is installable on its own, apart from the staff website, so it has its own
// manifest: scoped to /member, named after the gym whose address this is (iron.example.com) and
// tinted with its colour. On the main address it is simply "FlexHub Member".
app.get('/member.webmanifest', (req, res) => {
  const gym = req.hostTenant;
  const color = /^#[0-9A-Fa-f]{6}$/.test(gym?.brand?.color || '') ? gym.brand.color : '#0A0C10';
  res.type('application/manifest+json').set('Cache-Control', 'public, max-age=300').json({
    id: '/member',
    name: gym ? `${gym.name} Member` : 'FlexHub Member',
    short_name: (gym ? gym.name : 'FlexHub').slice(0, 12),
    description: 'Your membership, workouts, diet plans and entry pass.',
    start_url: '/member',
    scope: '/member',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0A0C10',
    theme_color: color,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  });
});

const frontendDist = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendDist, {
  setHeaders: (res, filePath) => {
    // The service worker must always be revalidated: if a stale copy is served from
    // the HTTP cache, it keeps serving its old precached bundle and users never get
    // the new build. Hashed assets alongside it are safe to cache normally.
    if (path.basename(filePath) === 'sw.js') res.setHeader('Cache-Control', 'no-cache');
  },
}));
app.get(/^(?!\/api|\/health|\/privacy).*/, (req, res, next) => {
  res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
    if (err) next(); // dist doesn't exist (e.g. local dev) — fall through to 404
  });
});

app.use((err, req, res, next) => {
  // Jest reports unhandled console noise as failures context; real errors still surface
  // through the response body the tests assert on.
  let status = err.status || 500;
  let message = err.message || 'Server error';
  // A bad id or value in a request is the caller's mistake (400), not a server fault, and a
  // database error message (regexes, casts, index names) is not something to show a user.
  if (err.name === 'CastError') { status = 400; message = 'One of the values in your request is not valid.'; }
  else if (err.name === 'ValidationError' && err.errors) { status = 400; message = Object.values(err.errors).map((e) => e.message).join('; '); }
  else if (err.code === 11000) { status = 409; message = 'That record already exists.'; }
  if (status >= 500) {
    if (process.env.NODE_ENV !== 'test') console.error(err);
    message = 'Something went wrong on our side. Please try again.';
  }
  res.status(status).json({ message });
});

module.exports = app;
