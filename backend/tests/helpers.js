require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../app');

const User = require('../models/User');
const Tenant = require('../models/Tenant');
const Branch = require('../models/Branch');
const MembershipPlan = require('../models/MembershipPlan');

// Tests run against a separate database on the same cluster — never the real one.
// MONGODB_URI's db name is swapped for a '-test' suffix unless MONGODB_URI_TEST is set.
const testUri = () => {
  if (process.env.MONGODB_URI_TEST) return process.env.MONGODB_URI_TEST;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set — cannot run tests');
  return uri.replace(/\/([^/?]+)(\?|$)/, '/$1-test$2');
};

const connect = async () => {
  if (mongoose.connection.readyState === 0) await mongoose.connect(testUri());
  const name = mongoose.connection.name;
  // Hard stop: everything below wipes data, so refuse to touch a non-test database.
  if (!name.endsWith('-test')) throw new Error(`Refusing to run tests against database "${name}"`);
};

const disconnect = async () => {
  // The Atlas user has read/write but not dropDatabase, so the wipe is done by emptying
  // every collection instead. Same end state, no elevated privilege required.
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
  await mongoose.disconnect();
};

const PASSWORD = 'TestPass123!';
let seq = 0;
const uniq = (prefix) => `${prefix}-${Date.now().toString(36)}-${seq++}`;

const login = async (email, password = PASSWORD) => {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.token;
};

const auth = (token) => ({ Authorization: `Bearer ${token}` });

// Builds an isolated tenant with a branch, an admin, a branch-manager, a trainer and a
// monthly plan. Each call is independent, so tests can't leak into one another.
const seedTenant = async (label = 'acme') => {
  const slug = uniq(label);
  const tenant = await Tenant.create({ name: `${label} Gym`, slug, contactEmail: `${slug}@example.com`, maxBranches: 5 });
  const branch = await Branch.create({ tenantId: tenant._id, name: `${label} Main` });
  const admin = await User.create({
    name: `${label} admin`, email: `admin-${slug}@example.com`, phone: '9000000001',
    password: PASSWORD, role: 'tenant-admin', tenantId: tenant._id,
  });
  const manager = await User.create({
    name: `${label} manager`, email: `manager-${slug}@example.com`, phone: '9000000002',
    password: PASSWORD, role: 'branch-manager', tenantId: tenant._id, branchId: branch._id,
  });
  const trainer = await User.create({
    name: `${label} trainer`, email: `trainer-${slug}@example.com`, phone: '9000000003',
    password: PASSWORD, role: 'trainer', tenantId: tenant._id, branchId: branch._id,
  });
  const plan = await MembershipPlan.create({
    tenantId: tenant._id, name: 'Monthly', durationUnit: 'monthly', price: 1000,
  });

  return {
    tenant,
    branch,
    plan,
    admin,
    manager,
    trainer,
    adminToken: await login(admin.email),
    managerToken: await login(manager.email),
    trainerToken: await login(trainer.email),
  };
};

const createSuperAdmin = async () => {
  const slug = uniq('super');
  const user = await User.create({
    name: 'Super', email: `${slug}@example.com`, phone: '9000000000',
    password: PASSWORD, role: 'super-admin',
  });
  return { user, token: await login(user.email) };
};

// Creates a member through the API so server-side derivation (dates, member code) runs.
const createMember = async (token, { branchId, planId, name = 'Test Member', phone = '9111111111' } = {}) => {
  const res = await request(app)
    .post('/api/members')
    .set(auth(token))
    .send({ name, phone, branchId, membershipPlanId: planId });
  if (res.status !== 201) throw new Error(`createMember failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
};

module.exports = {
  app, request, mongoose,
  connect, disconnect, seedTenant, createSuperAdmin, createMember,
  login, auth, uniq, PASSWORD,
};
