const { app, request, connect, disconnect, seedTenant, createMember, auth, mongoose } = require('./helpers');
const Member = require('../models/Member');
const Attendance = require('../models/Attendance');
const PtSession = require('../models/PtSession');
const Rating = require('../models/Rating');
const User = require('../models/User');
const Tenant = require('../models/Tenant');

let t; let other; let me; let meToken; let peer; let peerToken; let otherMember; let otherToken;

const loginAs = async (managerToken, member) => {
  const access = await request(app).post(`/api/members/${member._id}/app-access`).set(auth(managerToken));
  const login = await request(app).post('/api/member-auth/login').send({ identifier: access.body.memberCode, password: access.body.password });
  return login.body.token;
};

beforeAll(async () => {
  await connect();
  t = await seedTenant('prog');
  other = await seedTenant('prog-other');
  const mk = (tenant, name, phone) => createMember(tenant.managerToken, { branchId: tenant.branch._id.toString(), planId: tenant.plan._id.toString(), name, phone });
  me = await mk(t, 'Prog Member', '9670000001');
  peer = await mk(t, 'Prog Peer', '9670000002');
  otherMember = await mk(other, 'Other Gym Member', '9670000003');
  meToken = await loginAs(t.managerToken, me);
  peerToken = await loginAs(t.managerToken, peer);
  otherToken = await loginAs(other.managerToken, otherMember);
}, 120000);
afterAll(disconnect);

const visit = (member, tenant, daysAgo = 0) => Attendance.create({
  tenantId: tenant.tenant._id, branchId: tenant.branch._id, memberId: member._id, checkInAt: new Date(Date.now() - daysAgo * 86400000),
});
const enableRatings = (tenant, on = true) => Tenant.updateOne({ _id: tenant.tenant._id }, { $set: { 'features.features:ratings': on } });

describe('own progress', () => {
  it('starts empty, with badges still to earn', async () => {
    const res = await request(app).get('/api/member-app/progress').set(auth(meToken));
    expect(res.status).toBe(200);
    expect(res.body.metrics).toEqual([]);
    expect(res.body.achievements.find((a) => a.key === 'visits-1').earned).toBe(false);
  });

  it('logs weight and body fat, and shows the change since the first reading', async () => {
    await Member.updateOne({ _id: me._id }, { fitnessGoal: 'lose_fat' });
    const old = new Date(Date.now() - 30 * 86400000).toISOString();
    expect((await request(app).post('/api/member-app/progress').set(auth(meToken)).send({ weightKg: 84, bodyFatPct: 25, date: old })).status).toBe(201);
    const res = await request(app).post('/api/member-app/progress').set(auth(meToken)).send({ weightKg: 81.5, bodyFatPct: 22.5, notes: 'week 5' });
    expect(res.status).toBe(201);
    expect(res.body.summary).toMatchObject({ startWeightKg: 84, latestWeightKg: 81.5, changeKg: -2.5, changeBodyFatPct: -2.5 });
    expect(res.body.metrics.map((m) => m.weightKg)).toEqual([84, 81.5]); // oldest first, for the chart
    const lost2 = res.body.achievements.find((a) => a.key === 'lost-2');
    expect(lost2.earned).toBe(true);
    expect(res.body.achievements.find((a) => a.key === 'fat-2').earned).toBe(true);
  });

  it('turns check-ins into visit badges', async () => {
    for (let i = 0; i < 10; i += 1) await visit(me, t, i + 1);
    const res = await request(app).get('/api/member-app/progress').set(auth(meToken));
    expect(res.body.stats.totalVisits).toBe(10);
    expect(res.body.achievements.find((a) => a.key === 'visits-10').earned).toBe(true);
  });

  it('refuses entries that make no sense', async () => {
    const post = (b) => request(app).post('/api/member-app/progress').set(auth(meToken)).send(b);
    expect((await post({})).status).toBe(400);
    expect((await post({ notes: 'only a note' })).status).toBe(400);
    expect((await post({ weightKg: 5 })).status).toBe(400);
    expect((await post({ weightKg: 900 })).status).toBe(400);
    expect((await post({ bodyFatPct: 90 })).status).toBe(400);
    expect((await post({ weightKg: 70, date: new Date(Date.now() + 10 * 86400000).toISOString() })).status).toBe(400);
    expect((await post({ weightKg: 70, date: new Date(Date.now() - 800 * 86400000).toISOString() })).status).toBe(400);
    expect((await post({ weightKg: 70, memberId: 'x' })).status).toBe(400); // nothing outside the fields
  });

  it('lets a member delete their own entry, but not one their trainer recorded', async () => {
    const trainerEntry = await request(app).post(`/api/members/${me._id}/body-metrics`).set(auth(t.managerToken)).send({ weightKg: 83 });
    expect(trainerEntry.status).toBe(200);
    const list = (await request(app).get('/api/member-app/progress').set(auth(meToken))).body.metrics;
    const staffOne = list.find((m) => m.weightKg === 83);
    const own = list.find((m) => m.notes === 'week 5');
    expect(staffOne.source).toBe('staff');
    expect((await request(app).delete(`/api/member-app/progress/${staffOne._id}`).set(auth(meToken))).status).toBe(404);
    const del = await request(app).delete(`/api/member-app/progress/${own._id}`).set(auth(meToken));
    expect(del.status).toBe(200);
    expect(del.body.metrics.find((m) => m.notes === 'week 5')).toBeUndefined();
    expect((await request(app).delete('/api/member-app/progress/not-an-id').set(auth(meToken))).status).toBe(404);
  });

  it('never shows one member\'s progress to another, or lets them change it', async () => {
    const mine = (await request(app).get('/api/member-app/progress').set(auth(meToken))).body.metrics[0];
    expect((await request(app).get('/api/member-app/progress').set(auth(peerToken))).body.metrics).toEqual([]);
    expect((await request(app).delete(`/api/member-app/progress/${mine._id}`).set(auth(peerToken))).status).toBe(404);
    expect((await request(app).get('/api/member-app/progress')).status).toBe(401);
    expect((await request(app).get('/api/member-app/progress').set(auth(t.managerToken))).status).toBe(403); // staff use their own screens
  });
});

describe('ratings', () => {
  it('are off until the platform turns the feature on', async () => {
    expect((await request(app).get('/api/member-app/ratings').set(auth(meToken))).status).toBe(403);
    expect((await request(app).get('/api/ratings').set(auth(t.managerToken))).status).toBe(403);
    await enableRatings(t);
    expect((await request(app).get('/api/member-app/ratings').set(auth(meToken))).status).toBe(200);
  });

  it('let a member who has visited rate the gym, once, changing it later', async () => {
    const rate = (token, b) => request(app).put('/api/member-app/ratings/gym').set(auth(token)).send(b);
    expect((await rate(peerToken, { stars: 4 })).status).toBe(403); // never visited
    expect((await rate(meToken, { stars: 5, comment: 'Clean and friendly' })).status).toBe(200);
    expect((await rate(meToken, { stars: 3 })).status).toBe(200);
    expect(await Rating.countDocuments({ memberId: me._id, targetType: 'gym' })).toBe(1);
    const view = (await request(app).get('/api/member-app/ratings').set(auth(meToken))).body;
    expect(view.gym.mine).toMatchObject({ stars: 3, comment: '' });
  });

  it('check the stars and the comment', async () => {
    const rate = (b) => request(app).put('/api/member-app/ratings/gym').set(auth(meToken)).send(b);
    expect((await rate({ stars: 0 })).status).toBe(400);
    expect((await rate({ stars: 6 })).status).toBe(400);
    expect((await rate({ stars: 2.5 })).status).toBe(400);
    expect((await rate({})).status).toBe(400);
    expect((await rate({ stars: 4, comment: 'x'.repeat(501) })).status).toBe(400);
    expect((await rate({ stars: 4, tenantId: 'x' })).status).toBe(400);
  });

  it('hide the gym average from members until five have rated', async () => {
    expect((await request(app).get('/api/member-app/ratings').set(auth(meToken))).body.gym).toMatchObject({ average: null, count: null });
    const extra = Array.from({ length: 4 }, () => ({ tenantId: t.tenant._id, branchId: t.branch._id, memberId: new mongoose.Types.ObjectId(), targetType: 'gym', trainerId: null, stars: 5 }));
    await Rating.insertMany(extra);
    const gym = (await request(app).get('/api/member-app/ratings').set(auth(meToken))).body.gym;
    expect(gym.count).toBe(5);
    expect(gym.average).toBe(4.6); // (3 + 4*5) / 5
  });

  it('let a member rate a trainer who is assigned to them or has trained them, and no one else', async () => {
    const second = await User.create({ name: 'Other Trainer', email: `ot-${Date.now()}@example.com`, phone: '9000000009', password: 'Orchid-Lantern-47!', role: 'trainer', tenantId: t.tenant._id, branchId: t.branch._id });
    const rateT = (token, id, b) => request(app).put(`/api/member-app/ratings/trainers/${id}`).set(auth(token)).send(b);
    expect((await rateT(meToken, t.trainer._id, { stars: 5 })).status).toBe(403); // not assigned yet
    await Member.updateOne({ _id: me._id }, { assignedTrainerId: t.trainer._id });
    expect((await rateT(meToken, t.trainer._id, { stars: 5, comment: 'Patient and clear' })).status).toBe(200);
    expect((await rateT(meToken, second._id, { stars: 1 })).status).toBe(403);
    await PtSession.create({ tenantId: t.tenant._id, branchId: t.branch._id, trainerId: second._id, memberId: me._id, startAt: new Date(Date.now() - 86400000), endAt: new Date(Date.now() - 82800000), status: 'completed' });
    expect((await rateT(meToken, second._id, { stars: 4 })).status).toBe(200);
    expect((await rateT(meToken, other.trainer._id, { stars: 5 })).status).toBe(404); // another gym's trainer
    expect((await rateT(meToken, 'nope', { stars: 5 })).status).toBe(404);
    const view = (await request(app).get('/api/member-app/ratings').set(auth(meToken))).body;
    expect(view.trainers.find((x) => String(x._id) === String(t.trainer._id)).mine.stars).toBe(5);
    // A trainer's score is never part of what members see.
    expect(view.trainers.every((x) => !('average' in x) && !('count' in x) && !('distribution' in x))).toBe(true);
  });

  it('show owners and branch managers scores and comments, without who wrote them', async () => {
    const res = await request(app).get('/api/ratings').set(auth(t.managerToken));
    expect(res.status).toBe(200);
    const ours = res.body.trainers.find((x) => String(x.trainerId) === String(t.trainer._id));
    expect(ours).toMatchObject({ count: 1, average: 5 });
    expect(ours.recent[0]).toEqual({ stars: 5, comment: 'Patient and clear', at: expect.any(String) });
    expect(res.body.gym[0]).toMatchObject({ count: 5, average: 4.6 });
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(String(me._id));
    expect(text).not.toMatch(/memberId/);
    expect((await request(app).get('/api/ratings').set(auth(t.adminToken))).status).toBe(200);
  });

  it('are closed to trainers, signed-out visitors, and other gyms\' data', async () => {
    expect((await request(app).get('/api/ratings').set(auth(t.trainerToken))).status).toBe(403);
    expect((await request(app).get('/api/ratings')).status).toBe(401);
    await enableRatings(other);
    const theirs = await request(app).get('/api/ratings').set(auth(other.managerToken));
    expect(theirs.body.gym[0].count).toBe(0);
    expect(theirs.body.trainers.every((x) => String(x.trainerId) !== String(t.trainer._id))).toBe(true);
    expect((await request(app).get('/api/member-app/ratings').set(auth(otherToken))).body.trainers.map((x) => String(x._id))).not.toContain(String(t.trainer._id));
  });

  it('can be withdrawn', async () => {
    expect((await request(app).delete(`/api/member-app/ratings/trainers/${t.trainer._id}`).set(auth(meToken))).status).toBe(200);
    expect(await Rating.countDocuments({ memberId: me._id, trainerId: t.trainer._id })).toBe(0);
    expect((await request(app).delete('/api/member-app/ratings/gym').set(auth(meToken))).status).toBe(200);
    expect(await Rating.countDocuments({ memberId: me._id, targetType: 'gym' })).toBe(0);
  });
});
