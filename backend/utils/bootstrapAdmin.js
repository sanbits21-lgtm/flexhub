const User = require('../models/User');

const MIN_PASSWORD = 12;

/**
 * Creates the first super-admin from SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD at startup, for
 * hosts with no shell to run scripts/seedSuperAdmin.js. It only ever creates: an account that
 * already exists is left alone, so changing the password in the app is never undone by a
 * restart, and removing the variables afterwards is safe.
 */
const bootstrapSuperAdmin = async (env = process.env, log = console) => {
  const email = (env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = env.SUPER_ADMIN_PASSWORD || '';
  if (!email && !password) return null;
  if (!email || !password) {
    log.warn('SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must both be set; skipping super-admin bootstrap.');
    return null;
  }
  if (password.length < MIN_PASSWORD) {
    log.warn(`SUPER_ADMIN_PASSWORD must be at least ${MIN_PASSWORD} characters; skipping super-admin bootstrap.`);
    return null;
  }
  if (await User.exists({ email })) return null;

  await User.create({
    name: env.SUPER_ADMIN_NAME || 'Super Admin',
    email,
    phone: env.SUPER_ADMIN_PHONE || '0000000000',
    password,
    role: 'super-admin',
  });
  log.log(`Super admin created: ${email}. Remove SUPER_ADMIN_PASSWORD from the environment once you have signed in and changed it.`);
  return email;
};

module.exports = { bootstrapSuperAdmin };
