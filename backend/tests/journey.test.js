const { app, request, connect, disconnect, createSuperAdmin, auth, uniq } = require('./helpers');
const { outbox } = require('../utils/mailer');
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const MemberPayment = require('../models/MemberPayment');
const Attendance = require('../models/Attendance');

// One gym's whole life, start to finish, through the same HTTP API the website and apps use: a new gym
// registers, confirms its email, is approved, sets itself up, enrols a member, takes a UPI payment and
// a renewal, and the member signs in to the member app, tracks progress, rates the gym, and recovers
// their password. If any link in this chain breaks, this is the test that says so, in order.

const PASSWORD = 'Orchid-Lantern-47!';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mailTo = async (to, subject) => {
  for (let i = 0; i < 40; i += 1) {
    const m = outbox.filter((x) => x.to === to && (!subject || subject.test(x.subject)));
    if (m.length) return m[m.length - 1];
    await sleep(50);
  }
  throw new Error(`no email to ${to} matching ${subject}`);
};
const tokenIn = (mail) => mail.text.match(/token=([0-9a-f]{64})/)[1];

let superAdmin;
beforeAll(async () => { await connect(); superAdmin = await createSuperAdmin(); }, 90000);
afterAll(disconnect);

it('a gym goes from registration to a working member app', async () => {
  const id = uniq('j').toLowerCase();
  const owner = { gymName: `Journey ${id} Fitness`, ownerName: 'Asha Owner', email: `owner-${id}@example.com`, phone: '9800003333', password: PASSWORD };

  // 1. Registration needs the email confirmed and a platform admin's approval before anything works.
  expect((await request(app).post('/api/public/signup').send({ ...owner, acceptTerms: true })).status).toBe(201);
  expect((await request(app).post('/api/auth/login').send({ email: owner.email, password: PASSWORD })).status).toBe(403);
  const verifyMail = await mailTo(owner.email, /confirm your email/i);
  expect((await request(app).post('/api/public/verify-email').send({ token: tokenIn(verifyMail) })).status).toBe(200);
  expect((await request(app).post('/api/auth/login').send({ email: owner.email, password: PASSWORD })).status).toBe(403); // still waiting for approval
  const tenantId = String((await User.findOne({ email: owner.email })).tenantId);
  expect((await request(app).post(`/api/tenants/${tenantId}/approve`).set(auth(superAdmin.token)).send({})).status).toBe(200);

  // 2. The owner signs in and sets the gym up: a plan, a second branch with its own UPI account, a trainer.
  const login = await request(app).post('/api/auth/login').send({ email: owner.email, password: PASSWORD });
  expect(login.status).toBe(200);
  const ownerToken = login.body.token;
  const branches = (await request(app).get('/api/branches').set(auth(ownerToken))).body;
  const main = (branches.branches || branches)[0];
  const plan = (await request(app).post('/api/membership-plans').set(auth(ownerToken)).send({ name: 'Monthly', durationUnit: 'monthly', price: 1500 })).body;
  expect(plan._id).toBeTruthy();
  await request(app).put('/api/tenant-settings').set(auth(ownerToken)).send({ upiId: 'journey.gym@okbank' });
  await Tenant.updateOne({ _id: tenantId }, { maxBranches: 3 }); // a trial allows one branch; the platform admin raises it for a paying gym
  const north = (await request(app).post('/api/branches').set(auth(ownerToken)).send({ name: 'North' })).body;
  expect((await request(app).put(`/api/tenant-settings/branches/${north._id}/payment`).set(auth(ownerToken)).send({ upiId: 'journey.north@okaxis' })).status).toBe(200);
  const trainer = await request(app).post('/api/staff').set(auth(ownerToken)).send({ name: 'Tara Trainer', email: `trainer-${id}@example.com`, phone: '9800003334', password: PASSWORD, role: 'trainer', branchId: main._id });
  expect(trainer.status).toBe(201);

  // 3. A member joins the north branch, pays by UPI (into that branch's account), then renews.
  const member = (await request(app).post('/api/members').set(auth(ownerToken)).send({ name: 'Rohan Member', phone: '9800003335', branchId: north._id, membershipPlanId: plan._id })).body;
  expect(member.memberCode).toBeTruthy();
  const paid = await request(app).post('/api/payments').set(auth(ownerToken)).send({ memberId: member._id, membershipPlanId: plan._id, amount: 1500, method: 'upi', status: 'paid' });
  expect(paid.status).toBe(201);
  expect(paid.body.upiId).toBe('journey.north@okaxis');
  const renewed = await request(app).post(`/api/members/${member._id}/renew`).set(auth(ownerToken)).send({ method: 'cash' });
  expect(renewed.status).toBe(200);
  expect(await MemberPayment.countDocuments({ memberId: member._id, status: 'paid' })).toBe(2);

  // 4. Front desk checks the member in; the member signs in to the app with the login the owner issues.
  const north2 = await request(app).get('/api/members').set(auth(ownerToken));
  expect(north2.body.members.some((m) => m._id === member._id)).toBe(true);
  const access = await request(app).post(`/api/members/${member._id}/app-access`).set(auth(ownerToken));
  const mLogin = await request(app).post('/api/member-auth/login').send({ identifier: access.body.memberCode, password: access.body.password });
  expect(mLogin.status).toBe(200);
  const memberToken = mLogin.body.token;
  await Attendance.create({ tenantId, branchId: north._id, memberId: member._id, method: 'manual' });
  const me = await request(app).get('/api/member-app/me').set(auth(memberToken));
  expect(me.body.membershipStatus).toBe('active');

  // 5. In the app: log a measurement, see a badge, rate the gym once the platform has switched ratings on.
  const progress = await request(app).post('/api/member-app/progress').set(auth(memberToken)).send({ weightKg: 82, bodyFatPct: 24 });
  expect(progress.status).toBe(201);
  expect(progress.body.achievements.find((a) => a.key === 'visits-1').earned).toBe(true);
  expect((await request(app).get('/api/member-app/ratings').set(auth(memberToken))).status).toBe(403); // off until switched on
  await Tenant.updateOne({ _id: tenantId }, { $set: { 'features.features:ratings': true } });
  expect((await request(app).put('/api/member-app/ratings/gym').set(auth(memberToken)).send({ stars: 5, comment: 'Clean gym' })).status).toBe(200);
  const seen = await request(app).get('/api/ratings').set(auth(ownerToken));
  expect(seen.body.gym.find((g) => g.branchId === north._id).count).toBe(1);

  // 6. The owner forgets their password and gets back in with the emailed link.
  outbox.length = 0;
  expect((await request(app).post('/api/auth/forgot-password').send({ email: owner.email })).status).toBe(200);
  const resetMail = await mailTo(owner.email, /reset your password/i);
  const NEW = 'Copper-Harbor-91!';
  expect((await request(app).post('/api/auth/reset-password').send({ token: tokenIn(resetMail), password: NEW })).status).toBe(200);
  expect((await request(app).post('/api/auth/login').send({ email: owner.email, password: NEW })).status).toBe(200);
  expect((await request(app).post('/api/auth/login').send({ email: owner.email, password: PASSWORD })).status).toBe(401);
});
