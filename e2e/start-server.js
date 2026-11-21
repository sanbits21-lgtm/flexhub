// Starts the real FitzyClub server for the browser tests: a throwaway database, two seeded gyms, and the built website
// (frontend/dist) served by the same process, exactly as in production.
//
// SAFETY: it refuses any database whose name does not end in "-test", and it empties that database first. Never point it at real data.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const backend = path.join(root, 'backend');
require(path.join(backend, 'node_modules/dotenv')).config({ path: path.join(root, '.env') });

const uri = process.env.E2E_MONGODB_URI || String(process.env.MONGODB_URI || '').replace(/\/([^/?]+)(\?|$)/, '/$1-test$2');
if (!/\/[^/?]*-test(\?|$)/.test(uri)) {
  console.error('e2e: refusing to run, the database name must end in "-test". Set E2E_MONGODB_URI=mongodb://localhost:27017/flexhub-e2e-test');
  process.exit(1);
}
if (!fs.existsSync(path.join(root, 'frontend/dist/index.html'))) {
  console.error('e2e: the website is not built. Run: npm run build --prefix frontend');
  process.exit(1);
}

process.env.MONGODB_URI = uri;
process.env.MONGODB_URI_TEST = uri;
process.env.NODE_ENV = 'development';
process.env.PORT = process.env.E2E_PORT || '5051';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'e2e-only-secret-e2e-only-secret-e2e-only';
process.env.ALERTS = 'off';

(async () => {
  const mongoose = require(path.join(backend, 'node_modules/mongoose'));
  await mongoose.connect(uri);
  const wipe = async () => Promise.all((await mongoose.connection.db.collections()).map((c) => c.deleteMany({})));
  await wipe();

  const h = require(path.join(backend, 'tests/helpers'));
  const Tenant = require(path.join(backend, 'models/Tenant'));
  const a = await h.seedTenant('alpha');
  const b = await h.seedTenant('beta');
  await Tenant.updateOne({ _id: a.tenant._id }, {
    name: process.env.E2E_GYM_NAME || 'Alpha Iron House',
    upiId: 'alpha@okhdfc',
    ...(process.env.E2E_MEMBER_APP_URL ? { memberAppUrl: process.env.E2E_MEMBER_APP_URL } : {}),
  });
  if (process.env.E2E_OWNER_NAME) await require(path.join(backend, 'models/User')).updateOne({ _id: a.admin._id }, { name: process.env.E2E_OWNER_NAME });
  await Tenant.updateOne({ _id: b.tenant._id }, { name: 'Beta Fitness' });
  const betaMember = await h.createMember(b.managerToken, { branchId: b.branch._id.toString(), planId: b.plan._id.toString(), name: 'Beta Private Member', phone: '9812300001' });

  fs.writeFileSync(path.join(__dirname, '.seed.json'), JSON.stringify({
    password: h.PASSWORD,
    alpha: { managerEmail: a.manager.email, adminEmail: a.admin.email },
    beta: { managerEmail: b.manager.email, memberId: betaMember._id },
  }));
  await mongoose.disconnect(); // the server opens its own connection

  require(path.join(backend, 'server.js'));
})().catch((err) => { console.error('e2e seed failed:', err); process.exit(1); });
