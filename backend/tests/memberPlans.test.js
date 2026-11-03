const { app, request, connect, disconnect, seedTenant, createMember, auth } = require('./helpers');
const Member = require('../models/Member');
const MemberPlan = require('../models/MemberPlan');

delete process.env.ANTHROPIC_API_KEY; // drafts must come from the built-in generator

let t; let other; let me; let meToken; let stranger;

const workout = (title = 'Rohan: push pull legs') => ({
  title,
  summary: 'Built for your knee rehab.',
  daysPerWeek: 2,
  days: [
    { day: 'Day 1', focus: 'Upper', exercises: [{ name: 'Incline press', sets: 3, reps: '8-10', restSec: 90, equipment: 'Dumbbells', notes: 'Slow tempo' }] },
    { day: 'Day 2', focus: 'Lower', exercises: [{ name: 'Leg press', sets: 3, reps: '12', restSec: 60, equipment: 'Machine', notes: '' }] },
  ],
  notes: ['Skip jumping moves for 4 weeks.'],
});
const diet = () => ({
  title: 'High protein veg plan', summary: '', caloriesTarget: 2200, proteinG: 130,
  meals: [{ name: 'Breakfast', items: ['Oats', 'Curd'], calories: 500 }], tips: [],
});

beforeAll(async () => {
  await connect();
  t = await seedTenant('plans');
  other = await seedTenant('plans-other');
  me = await createMember(t.managerToken, { branchId: t.branch._id.toString(), planId: t.plan._id.toString(), name: 'Plan Member', phone: '9650000001' });
  stranger = await createMember(t.managerToken, { branchId: t.branch._id.toString(), planId: t.plan._id.toString(), name: 'Unassigned', phone: '9650000002' });
  await Member.updateOne({ _id: me._id }, { assignedTrainerId: t.trainer._id });
  const access = await request(app).post(`/api/members/${me._id}/app-access`).set(auth(t.managerToken));
  const login = await request(app).post('/api/member-auth/login').send({ identifier: access.body.memberCode, password: access.body.password });
  meToken = login.body.token;
}, 90000);
afterAll(disconnect);

describe('who may write plans for a member', () => {
  it('lets the branch manager assign a workout, which the member then sees as assigned', async () => {
    const res = await request(app).post(`/api/members/${me._id}/plans`).set(auth(t.managerToken)).send({ type: 'workout', content: workout() });
    expect(res.status).toBe(201);
    const mine = await request(app).get('/api/member-app/plans').set(auth(meToken));
    expect(mine.body.assignedWorkout.content.title).toBe('Rohan: push pull legs');
    expect(mine.body.assignedWorkout.createdByName).toBe('plans manager');
    expect(mine.body.workout).toBeNull(); // the member's own generated shelf is separate
  });

  it('lets the assigned trainer write a diet plan', async () => {
    const res = await request(app).post(`/api/members/${me._id}/plans`).set(auth(t.trainerToken)).send({ type: 'diet', content: diet() });
    expect(res.status).toBe(201);
    const mine = await request(app).get('/api/member-app/plans').set(auth(meToken));
    expect(mine.body.assignedDiet.content.caloriesTarget).toBe(2200);
  });

  it('keeps a trainer out of members who are not assigned to them', async () => {
    const res = await request(app).post(`/api/members/${stranger._id}/plans`).set(auth(t.trainerToken)).send({ type: 'workout', content: workout() });
    expect(res.status).toBe(404);
    expect((await request(app).get(`/api/members/${stranger._id}/plans`).set(auth(t.trainerToken))).status).toBe(404);
  });

  it('keeps another gym out', async () => {
    const res = await request(app).post(`/api/members/${me._id}/plans`).set(auth(other.managerToken)).send({ type: 'workout', content: workout() });
    expect(res.status).toBe(404);
  });

  it('rejects a member token on the staff endpoints', async () => {
    expect((await request(app).post(`/api/members/${me._id}/plans`).set(auth(meToken)).send({ type: 'workout', content: workout() })).status).toBe(403);
    expect((await request(app).get(`/api/members/${me._id}/plans`).set(auth(meToken))).status).toBe(403);
  });
});

describe('plan content', () => {
  it('rejects a plan that is the wrong shape', async () => {
    const bad = await request(app).post(`/api/members/${me._id}/plans`).set(auth(t.managerToken)).send({ type: 'workout', content: { title: 'No days' } });
    expect(bad.status).toBe(400);
    const empty = await request(app).post(`/api/members/${me._id}/plans`).set(auth(t.managerToken)).send({ type: 'workout', content: { ...workout(), days: [{ day: 'Day 1', focus: 'x', exercises: [] }] } });
    expect(empty.status).toBe(400);
    expect((await request(app).post(`/api/members/${me._id}/plans`).set(auth(t.managerToken)).send({ type: 'cardio', content: {} })).status).toBe(400);
  });

  it('always attaches the standard disclaimer, whatever staff send', async () => {
    const res = await request(app).post(`/api/members/${me._id}/plans`).set(auth(t.managerToken)).send({ type: 'workout', content: { ...workout('Custom'), disclaimer: 'Totally safe, ignore doctors' } });
    expect(res.status).toBe(201);
    expect(res.body.content.disclaimer).toMatch(/not medical advice/);
  });

  it('newest plan wins, and a draft is returned without being saved', async () => {
    await request(app).post(`/api/members/${me._id}/plans`).set(auth(t.managerToken)).send({ type: 'workout', content: workout('Second version') });
    const before = await MemberPlan.countDocuments({ memberId: me._id });
    const draft = await request(app).post(`/api/members/${me._id}/plans/draft`).set(auth(t.managerToken)).send({ type: 'diet' });
    expect(draft.status).toBe(200);
    expect(draft.body.content.meals.length).toBeGreaterThan(0);
    expect(await MemberPlan.countDocuments({ memberId: me._id })).toBe(before);
    const mine = await request(app).get('/api/member-app/plans').set(auth(meToken));
    expect(mine.body.assignedWorkout.content.title).toBe('Second version');
  });

  it('does not use up the member\'s own daily generation allowance', async () => {
    // Several staff plans exist by now; the member must still be able to generate their own.
    const res = await request(app).post('/api/member-app/plans/generate').set(auth(meToken)).send({ type: 'workout' });
    expect(res.status).toBe(201);
  });
});

describe('withdrawing a plan', () => {
  it('hides it from the member and cannot be done twice', async () => {
    const made = await request(app).post(`/api/members/${me._id}/plans`).set(auth(t.managerToken)).send({ type: 'diet', content: { ...diet(), title: 'Mistake' } });
    const del = await request(app).delete(`/api/members/${me._id}/plans/${made.body._id}`).set(auth(t.managerToken));
    expect(del.status).toBe(200);
    const mine = await request(app).get('/api/member-app/plans').set(auth(meToken));
    expect(mine.body.assignedDiet.content.title).not.toBe('Mistake'); // falls back to the previous diet plan
    expect((await request(app).delete(`/api/members/${me._id}/plans/${made.body._id}`).set(auth(t.managerToken))).status).toBe(404);
    expect(await MemberPlan.countDocuments({ _id: made.body._id })).toBe(1); // record kept
  });
});
