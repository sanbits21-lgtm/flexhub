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

const app = express();

// Behind a reverse proxy (Render/Railway/Fly/nginx, etc.) in production, so req.ip
// reflects the real client for rate limiting instead of the proxy's own address.
app.set('trust proxy', 1);

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

app.use(express.json({ limit: '5mb' })); // bulk member upload can post hundreds of rows

// Rate limiting is skipped under test: the suite fires hundreds of requests from one
// address, including deliberate bad logins, and would otherwise trip its own limiter.
if (process.env.NODE_ENV !== 'test') {
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
  app.use('/api/auth/login', loginLimiter);
  app.use('/api/member-auth/login', loginLimiter);
}

app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

app.use('/api/auth', authRoutes);
app.use('/api/member-auth', memberAuthRoutes);
app.use('/api/platform-admins', platformAdminRoutes);
app.use('/api/tenants', tenantRoutes);
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

// Single-service deployment: serve the built frontend from this same process when
// present, so the whole app is one Node service (no separate static host needed, and
// no CORS setup required since frontend + API share an origin). No-op locally, where
// frontend/dist doesn't exist and Vite's own dev server is used instead.
const frontendDist = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendDist, {
  setHeaders: (res, filePath) => {
    // The service worker must always be revalidated: if a stale copy is served from
    // the HTTP cache, it keeps serving its old precached bundle and users never get
    // the new build. Hashed assets alongside it are safe to cache normally.
    if (path.basename(filePath) === 'sw.js') res.setHeader('Cache-Control', 'no-cache');
  },
}));
app.get(/^(?!\/api|\/health).*/, (req, res, next) => {
  res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
    if (err) next(); // dist doesn't exist (e.g. local dev) — fall through to 404
  });
});

app.use((err, req, res, next) => {
  // Jest reports unhandled console noise as failures context; real errors still surface
  // through the response body the tests assert on.
  if (process.env.NODE_ENV !== 'test') console.error(err);
  res.status(err.status || 500).json({ message: err.message || 'Server error' });
});

module.exports = app;
