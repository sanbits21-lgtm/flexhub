require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const connectDB = require('./config/db');
const app = require('./app');

// The express app itself lives in app.js so the test suite can mount it with supertest
// without opening a port or connecting to the production database.
const PORT = process.env.PORT || 5000;

// A weak or placeholder signing secret in production means anyone can mint admin tokens,
// so refuse to start rather than run quietly insecure.
if (process.env.NODE_ENV === 'production') {
  const secret = process.env.JWT_SECRET || '';
  if (secret.length < 32 || /change_me|changeme|secret$/i.test(secret)) {
    console.error('JWT_SECRET must be a random string of at least 32 characters in production.');
    process.exit(1);
  }
}

// Links in emails (confirm your email, a new gym is waiting) are built from PUBLIC_URL. Without it
// they would use whatever Host header the request carried, which an attacker can choose.
// Render tells every web service its own address (RENDER_EXTERNAL_URL), so that works with no
// setup; a custom domain still needs PUBLIC_URL, which always wins.
if (!process.env.PUBLIC_URL && process.env.RENDER_EXTERNAL_URL) process.env.PUBLIC_URL = process.env.RENDER_EXTERNAL_URL;
if (process.env.NODE_ENV === 'production' && !/^https?:\/\/[^\s/]+/i.test(process.env.PUBLIC_URL || '')) {
  console.error('PUBLIC_URL must be set in production, for example https://app.example.com (no trailing path).');
  process.exit(1);
}

// A request that fails is reported from the error handler in app.js. These two catch what never reaches it:
// a promise nobody handled, and a crash. A crash is reported (best effort, a few seconds) and the process
// then exits, so the host restarts it with a clean state instead of limping on.
process.on('unhandledRejection', (reason) => {
  console.error('unhandled rejection:', reason);
  require('./utils/alerts').notifyError(reason instanceof Error ? reason : new Error(String(reason)), 'unhandled rejection');
});
process.on('uncaughtException', (err) => {
  console.error('uncaught exception:', err);
  Promise.race([require('./utils/alerts').notifyError(err, 'uncaught exception'), new Promise((r) => setTimeout(r, 4000))]).finally(() => process.exit(1));
});

// Local development should not run against the live database: a test gym, a deleted record or a bad
// migration would be real. Say so loudly (production hosts are exempt).
const { isRemoteMongoUri } = require('./utils/devGuard');
if (process.env.NODE_ENV !== 'production' && isRemoteMongoUri(process.env.MONGODB_URI)) {
  console.warn('');
  console.warn('!!  This is NOT a production server, but MONGODB_URI points at a remote database.');
  console.warn('!!  If that is the database your live site uses, everything you do here changes real data.');
  console.warn('!!  Use a separate development database, for example a local MongoDB (docker compose up mongo) with');
  console.warn('!!  MONGODB_URI=mongodb://localhost:27017/flexhub . See docs/OPERATIONS.md. REQUIRE_LOCAL_DB=on makes this an error.');
  console.warn('');
  if (String(process.env.REQUIRE_LOCAL_DB || '').toLowerCase() === 'on') {
    console.error('REQUIRE_LOCAL_DB=on: refusing to start against a remote database.');
    process.exit(1);
  }
}

connectDB().then(() => require('./utils/migrations').run()).then(() => require('./utils/bootstrapAdmin').bootstrapSuperAdmin()).then(() => {
  const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  require('./utils/expiryNotices').startExpiryScheduler();

  // Orchestrators stop containers with SIGTERM: finish in-flight requests (a payment being
  // recorded must not be cut off), close the DB, then exit. The timer is a backstop.
  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down`);
    setTimeout(() => process.exit(1), 10000).unref();
    server.close(() => require('mongoose').disconnect().finally(() => process.exit(0)));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}).catch((err) => {
  console.error('Failed to connect to MongoDB', err);
  process.exit(1);
});
