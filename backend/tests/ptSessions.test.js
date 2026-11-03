const { app, request, connect, disconnect, seedTenant, createMember, auth, login, PASSWORD, uniq } = require('./helpers');
const Member = require('../models/Member');
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const PtSession = require('../models/PtSession');
const ClassSession = require('../models/ClassSession');
const ClassType = require('../models/ClassType');

let t; let other; let mine; let peer; let stranger; let trainer2; let trainer2Token; let meToken; let peerToken;

const at = (hoursFromNow, minutes = 60) => {
  const start = new Date(Date.now() + hoursFromNow * 3600000);
  start.setSeconds(0, 0);
  return { startAt: start.toISOString(), endAt: new Date(start.getTime() + minutes * 60000).toISOString() };
};

const memberLogin = async (m) => {
  const a = await request(app).post(`/api/members/${m._id}/app-access`).set(auth(t.managerToken));
  const l = await request(app).post('/api/member-auth/login').send({ identifier: a.body.memberCode, password: a.body.password });
  return l.body.token;
};

beforeAll(async () => {
  await connect();
  t = await seedTenant('pt');
  other = await seedTenant('pt-other');
  const mk = (name, phone) => createMember(t.managerToken, { branchId: t.branch._id.toString(), planId: t.plan._id.toString(), name, phone });
  mine = await mk('My Client', '9660000001');
  peer = await mk('Peer Client', '9660000002');
  stranger = await mk('Not Mine', '9660000003');
  await Member.updateOne({ _id: mine._id }, { assignedTrainerId: t.trainer._id });
  await Member.updateOne({ _id: peer._id }, { assignedTrainerId: t.trainer._id });
  const slug = uniq('t2');
  trainer2 = await User.create({
    name: 'Second Trainer', email: `${slug}@example.com`, phone: '9000000009', password: PASSWORD, role: 'trainer', tenantId: t.tenant._id, branchId: t.branch._id,
  });
  trainer2Token = await login(trainer2.email);
  meToken = await memberLogin(mine);
  peerToken = await memberLogin(peer);
}, 120000);
afterAll(disconnect);

const book = (token, body) => request(app).post('/api/pt-sessions').set(auth(token)).send(body);

describe('scheduling a one-to-one session', () => {
  it('lets a trainer schedule an assigned member, as themselves', async () => {
    const res = await book(t.trainerToken, { memberId: mine._id, ...at(24), focus: 'Legs' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('scheduled');
    expect(String(res.body.trainerId._id)).toBe(String(t.trainer._id));
  });

  it('keeps a trainer to their own members', async () => {
    expect((await book(t.trainerToken, { memberId: stranger._id, ...at(30) })).status).toBe(404);
  });

  it('ignores a trainerId a trainer tries to supply', async () => {
    const res = await book(t.trainerToken, { memberId: peer._id, trainerId: trainer2._id, ...at(48) });
    expect(res.status).toBe(201);
    expect(String(res.body.trainerId._id)).toBe(String(t.trainer._id));
  });

  it('rejects bad times', async () => {
    expect((await book(t.trainerToken, { memberId: mine._id, ...at(-5) })).status).toBe(400); // past
    const { startAt } = at(60);
    expect((await book(t.trainerToken, { memberId: mine._id, startAt, endAt: startAt })).status).toBe(400); // zero length
    expect((await book(t.trainerToken, { memberId: mine._id, ...at(70, 300) })).status).toBe(400); // over 4h
    expect((await book(t.trainerToken, { memberId: mine._id, startAt: 'soon', endAt: 'later' })).status).toBe(400);
  });

  it('refuses a double-booked trainer, including against a group class', async () => {
    const slot = at(24, 30); // overlaps the first session (24h, 60 min)
    expect((await book(t.trainerToken, { memberId: peer._id, ...slot })).status).toBe(409);

    const classType = await ClassType.create({ tenantId: t.tenant._id, name: 'Yoga', durationMinutes: 60, defaultCapacity: 10 });
    const cls = at(100);
    await ClassSession.create({ tenantId: t.tenant._id, branchId: t.branch._id, classTypeId: classType._id, trainerId: t.trainer._id, startAt: cls.startAt, endAt: cls.endAt });
    const res = await book(t.trainerToken, { memberId: mine._id, ...cls });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/class/i);
  });

  it('refuses a double-booked member', async () => {
    // trainer2 is free, but this member already has the 24h session with trainer 1.
    const res = await book(t.managerToken, { memberId: mine._id, trainerId: trainer2._id, ...at(24, 30) });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/member/i);
  });

  it('lets a branch manager schedule with a chosen trainer, and requires one', async () => {
    expect((await book(t.managerToken, { memberId: stranger._id, trainerId: trainer2._id, ...at(120) })).status).toBe(201);
    expect((await book(t.managerToken, { memberId: stranger._id, ...at(130) })).status).toBe(400);
  });

  it('rejects a trainer from another gym', async () => {
    const res = await book(t.managerToken, { memberId: stranger._id, trainerId: other.trainer._id, ...at(140) });
    expect(res.status).toBe(400);
  });
});

describe('who sees what', () => {
  it('shows a trainer only their own sessions, a manager all of them, another gym none', async () => {
    const mineList = await request(app).get('/api/pt-sessions').set(auth(t.trainerToken));
    expect(mineList.body.length).toBeGreaterThan(0);
    expect(mineList.body.every((s) => String(s.trainerId._id) === String(t.trainer._id))).toBe(true);

    const t2List = await request(app).get('/api/pt-sessions').set(auth(trainer2Token));
    expect(t2List.body.every((s) => String(s.trainerId._id) === String(trainer2._id))).toBe(true);

    const all = await request(app).get('/api/pt-sessions').set(auth(t.managerToken));
    expect(all.body.length).toBeGreaterThan(mineList.body.length);

    expect((await request(app).get('/api/pt-sessions').set(auth(other.managerToken))).body).toEqual([]);
  });

  it('hides another trainer\'s session from a trainer', async () => {
    const theirs = (await request(app).get('/api/pt-sessions').set(auth(trainer2Token))).body[0];
    expect((await request(app).post(`/api/pt-sessions/${theirs._id}/cancel`).set(auth(t.trainerToken))).status).toBe(404);
  });

  it('blocks a member token from the staff endpoints', async () => {
    expect((await request(app).get('/api/pt-sessions').set(auth(meToken))).status).toBe(403);
  });
});

describe('outcomes', () => {
  it('will not complete a session that has not started', async () => {
    const future = (await request(app).get('/api/pt-sessions').set(auth(t.trainerToken))).body[0];
    expect((await request(app).post(`/api/pt-sessions/${future._id}/complete`).set(auth(t.trainerToken))).status).toBe(400);
  });

  it('completes a past session once, and not again', async () => {
    const past = await PtSession.create({
      tenantId: t.tenant._id, branchId: t.branch._id, trainerId: t.trainer._id, memberId: mine._id,
      startAt: new Date(Date.now() - 3 * 3600000), endAt: new Date(Date.now() - 2 * 3600000),
    });
    const done = await request(app).post(`/api/pt-sessions/${past._id}/complete`).set(auth(t.trainerToken));
    expect(done.status).toBe(200);
    expect(done.body.status).toBe('completed');
    expect((await request(app).post(`/api/pt-sessions/${past._id}/no-show`).set(auth(t.trainerToken))).status).toBe(400);
  });

  it('cancels, frees the slot, and lets it be rebooked', async () => {
    const s = (await book(t.trainerToken, { memberId: mine._id, ...at(200) })).body;
    expect((await request(app).post(`/api/pt-sessions/${s._id}/cancel`).set(auth(t.trainerToken))).body.status).toBe('cancelled');
    expect((await book(t.trainerToken, { memberId: mine._id, ...at(200) })).status).toBe(201);
  });

  it('reschedules with the same conflict checks', async () => {
    const s = (await book(t.trainerToken, { memberId: mine._id, ...at(300) })).body;
    const moved = at(310);
    expect((await request(app).put(`/api/pt-sessions/${s._id}`).set(auth(t.trainerToken)).send(moved)).status).toBe(200);
    const clash = at(24, 30);
    expect((await request(app).put(`/api/pt-sessions/${s._id}`).set(auth(t.trainerToken)).send(clash)).status).toBe(409);
    expect((await request(app).put(`/api/pt-sessions/${s._id}`).set(auth(t.trainerToken)).send({ memberId: peer._id })).status).toBe(400); // not editable
  });
});

describe('the member\'s view', () => {
  it('lists their sessions and booked classes, nobody else\'s', async () => {
    const res = await request(app).get('/api/member-app/sessions').set(auth(meToken));
    expect(res.status).toBe(200);
    expect(res.body.training.length).toBeGreaterThan(0);
    expect(res.body.training[0].trainerName).toBe('pt trainer');
    const peerRes = await request(app).get('/api/member-app/sessions').set(auth(peerToken));
    const mineIds = new Set(res.body.training.map((s) => s._id));
    expect(peerRes.body.training.some((s) => mineIds.has(s._id))).toBe(false);
  });

  it('lets a member cancel an upcoming session but not someone else\'s', async () => {
    const mineSessions = (await request(app).get('/api/member-app/sessions').set(auth(meToken))).body.training;
    const upcoming = mineSessions.find((s) => s.status === 'scheduled');
    expect((await request(app).post(`/api/member-app/sessions/${upcoming._id}/cancel`).set(auth(peerToken))).status).toBe(404);
    expect((await request(app).post(`/api/member-app/sessions/${upcoming._id}/cancel`).set(auth(meToken))).status).toBe(200);
    expect((await request(app).post(`/api/member-app/sessions/${upcoming._id}/cancel`).set(auth(meToken))).status).toBe(400);
  });
});

describe('feature flag', () => {
  it('blocks the endpoints when a gym turns personal training off', async () => {
    await Tenant.updateOne({ _id: other.tenant._id }, { $set: { 'features.features:personalTraining': false } });
    const res = await request(app).get('/api/pt-sessions').set(auth(other.managerToken));
    expect(res.status).toBe(403);
  });
});
