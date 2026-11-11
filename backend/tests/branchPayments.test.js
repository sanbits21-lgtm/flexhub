const { app, request, connect, disconnect, seedTenant, createMember, login, auth, uniq, PASSWORD } = require('./helpers');
const Branch = require('../models/Branch');
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const MemberPayment = require('../models/MemberPayment');
const MembershipPlan = require('../models/MembershipPlan');

let t; let other; let north; let northManagerToken; let southMember; let mainMember;
const gymUpi = 'gym.main@okbank';
const northUpi = 'north.branch@okaxis';

const setBranch = (token, branchId, body) => request(app).put(`/api/tenant-settings/branches/${branchId}/payment`).set(auth(token)).send(body);

beforeAll(async () => {
  await connect();
  t = await seedTenant('branchpay');
  other = await seedTenant('branchpay-other');
  await Tenant.updateOne({ _id: t.tenant._id }, { upiId: gymUpi, upiPaymentLink: 'https://pay.example.com/gym' });
  north = await Branch.create({ tenantId: t.tenant._id, name: 'North' });
  const northManager = await User.create({
    name: 'North manager', email: `north-${uniq('m')}@example.com`, phone: '9000000077', password: PASSWORD, role: 'branch-manager', tenantId: t.tenant._id, branchId: north._id,
  });
  northManagerToken = await login(northManager.email);
  mainMember = await createMember(t.managerToken, { branchId: t.branch._id.toString(), planId: t.plan._id.toString(), name: 'Main Member', phone: '9680000001' });
  southMember = await createMember(t.adminToken, { branchId: north._id.toString(), planId: t.plan._id.toString(), name: 'North Member', phone: '9680000002' });
}, 120000);
afterAll(disconnect);

describe('a branch\'s own UPI account', () => {
  it('starts on the gym\'s account, so nothing changes for existing gyms', async () => {
    const res = await request(app).get('/api/tenant-settings/payment-accounts').set(auth(t.adminToken));
    expect(res.status).toBe(200);
    expect(res.body.default).toEqual({ upiId: gymUpi, upiPaymentLink: 'https://pay.example.com/gym' });
    expect(res.body.branches.every((b) => b.usesDefault)).toBe(true);
    expect((await request(app).get('/api/tenant-settings').set(auth(t.adminToken))).body.branchAccounts).toEqual({});
  });

  it('lets the owner give a branch its own account', async () => {
    const res = await setBranch(t.adminToken, north._id, { upiId: northUpi, upiPaymentLink: 'https://pay.example.com/north' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ upiId: northUpi, usesDefault: false });
    const settings = (await request(app).get('/api/tenant-settings').set(auth(t.adminToken))).body;
    expect(settings.upiId).toBe(gymUpi); // the gym's own is untouched
    expect(settings.branchAccounts[String(north._id)]).toEqual({ upiId: northUpi, upiPaymentLink: 'https://pay.example.com/north' });
  });

  it('shows a branch manager only their own branch\'s account', async () => {
    const north_ = (await request(app).get('/api/tenant-settings').set(auth(northManagerToken))).body;
    expect(Object.keys(north_.branchAccounts)).toEqual([String(north._id)]);
    const main = (await request(app).get('/api/tenant-settings').set(auth(t.managerToken))).body;
    expect(main.branchAccounts).toEqual({}); // main has none, and cannot see north's
  });

  it('is for the owner alone', async () => {
    expect((await setBranch(t.managerToken, t.branch._id, { upiId: 'x.y@bank' })).status).toBe(403);
    expect((await setBranch(northManagerToken, north._id, { upiId: 'x.y@bank' })).status).toBe(403);
    expect((await setBranch(t.trainerToken, north._id, { upiId: 'x.y@bank' })).status).toBe(403);
    expect((await request(app).get('/api/tenant-settings/payment-accounts').set(auth(t.managerToken))).status).toBe(403);
  });

  it('refuses a bad UPI ID, an insecure link, and a link with no ID of its own', async () => {
    expect((await setBranch(t.adminToken, north._id, { upiId: 'not a upi id' })).status).toBe(400);
    expect((await setBranch(t.adminToken, north._id, { upiId: 'ok.id@bank', upiPaymentLink: 'http://pay.example.com' })).status).toBe(400);
    const noId = await setBranch(t.adminToken, t.branch._id, { upiId: '', upiPaymentLink: 'https://pay.example.com/main' });
    expect(noId.status).toBe(400); // would borrow the gym's account
    expect(noId.body.message).toMatch(/UPI ID/);
  });

  it('cannot reach another gym\'s branch, or a branch that does not exist', async () => {
    expect((await setBranch(other.adminToken, north._id, { upiId: 'hijack@bank' })).status).toBe(404);
    expect((await setBranch(t.adminToken, '507f1f77bcf86cd799439011', { upiId: 'x.y@bank' })).status).toBe(404);
    expect((await Branch.findById(north._id)).upiId).toBe(northUpi);
  });

  it('puts the branch back on the gym\'s account when cleared', async () => {
    await setBranch(t.adminToken, t.branch._id, { upiId: 'main.own@okbank' });
    const cleared = await setBranch(t.adminToken, t.branch._id, { upiId: '', upiPaymentLink: '' });
    expect(cleared.body.usesDefault).toBe(true);
    expect((await request(app).get('/api/tenant-settings').set(auth(t.adminToken))).body.branchAccounts[String(t.branch._id)]).toBeUndefined();
  });

  it('is behind the Payment Settings feature flag', async () => {
    await Tenant.updateOne({ _id: other.tenant._id }, { $set: { 'features.pages:paymentSettings': false } });
    expect((await setBranch(other.adminToken, other.branch._id, { upiId: 'x.y@bank' })).status).toBe(403);
  });
});

describe('which account a UPI payment is stamped with', () => {
  const pay = (token, member, method = 'upi') => request(app).post('/api/payments').set(auth(token)).send({ memberId: member._id, membershipPlanId: t.plan._id.toString(), amount: 1000, method, status: 'paid' });

  it('uses the branch\'s own account where it has one, and the gym\'s where it does not', async () => {
    const north_ = await pay(t.adminToken, southMember);
    expect(north_.status).toBe(201);
    expect(north_.body.upiId).toBe(northUpi);
    const main = await pay(t.managerToken, mainMember);
    expect(main.body.upiId).toBe(gymUpi);
  });

  it('stamps nothing on a cash payment', async () => {
    const cash = await pay(t.managerToken, mainMember, 'cash');
    expect(cash.body.upiId).toBeUndefined();
  });

  it('stamps a renewal the same way', async () => {
    const res = await request(app).post(`/api/members/${southMember._id}/renew`).set(auth(t.adminToken)).send({ method: 'upi' });
    expect(res.status).toBe(200);
    expect(res.body.payment.upiId).toBe(northUpi);
  });

  it('keeps the stamp when the branch account is changed later', async () => {
    const before = await pay(t.adminToken, southMember);
    await setBranch(t.adminToken, north._id, { upiId: 'north.new@okaxis' });
    expect((await MemberPayment.findById(before.body._id)).upiId).toBe(northUpi);
    expect((await pay(t.adminToken, southMember)).body.upiId).toBe('north.new@okaxis');
  });
});

describe('bulk import and branch-specific plans', () => {
  it('refuses a plan that belongs to another branch, and accepts a gym-wide one', async () => {
    const southOnly = await MembershipPlan.create({ tenantId: t.tenant._id, branchId: north._id, name: 'North only', durationUnit: 'monthly', price: 500 });
    const body = { branchId: t.branch._id.toString(), members: [
      { name: 'Wrong Branch Plan', phone: '9680000011', membershipPlanId: southOnly._id.toString() },
      { name: 'Gym Wide Plan', phone: '9680000012', membershipPlanId: t.plan._id.toString() },
    ] };
    const res = await request(app).post('/api/members/bulk').set(auth(t.managerToken)).send(body);
    expect(res.status).toBe(201);
    expect(res.body.results[0]).toMatchObject({ success: false, error: 'This plan belongs to a different branch' });
    expect(res.body.results[1].success).toBe(true);
  });
});
