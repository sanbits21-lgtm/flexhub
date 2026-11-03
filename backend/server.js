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

connectDB().then(() => require('./utils/migrations').run()).then(() => require('./utils/bootstrapAdmin').bootstrapSuperAdmin()).then(() => {
  const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

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
