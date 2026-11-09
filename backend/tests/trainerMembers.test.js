const { app, request, connect, disconnect, seedTenant, auth } = require('./helpers');
const Member = require('../models/Member');

delete process.env.ANTHROPIC_API_KEY;

let t;
beforeAll(async () => { await connect(); t = await seedTenant('trainer-add'); }, 90000);
afterAll(disconnect);

const body = (over = {}) => ({ name: 'Walk In', phone: '9660000001', branchId: t.branch._id.toString(), ...over });

describe('a trainer adding members', () => {
  it('creates the member in their branch, assigned to them, and then sees them in their list', async () => {
    const res = await request(app).post('/api/members').set(auth(t.trainerToken)).send(body());
    expect(res.status).toBe(201);
    expect(String(res.body.assignedTrainerId)).toBe(String(t.trainer._id));
    expect(String(res.body.branchId)).toBe(String(t.branch._id));
    const mine = await request(app).get('/api/members').set(auth(t.trainerToken));
    expect(mine.body.members.map((m) => m._id)).toContain(res.body._id);
  });

  it('cannot hand the member to another trainer or another branch', async () => {
    const res = await request(app).post('/api/members').set(auth(t.trainerToken))
      .send(body({ phone: '9660000002', assignedTrainerId: '507f1f77bcf86cd799439011', branchId: '507f1f77bcf86cd799439012' }));
    expect(res.status).toBe(201);
    expect(String(res.body.assignedTrainerId)).toBe(String(t.trainer._id));
    expect(String(res.body.branchId)).toBe(String(t.branch._id));
  });

  it('keeps membership plans and payments with the front desk', async () => {
    const res = await request(app).post('/api/members').set(auth(t.trainerToken))
      .send(body({ phone: '9660000003', membershipPlanId: t.plan._id.toString() }));
    expect(res.status).toBe(403);
    expect(await Member.exists({ phone: '9660000003' })).toBeNull();
  });

  it('can then write a workout and a diet plan for the member they added', async () => {
    const m = (await request(app).post('/api/members').set(auth(t.trainerToken)).send(body({ phone: '9660000004' }))).body;
    const draft = await request(app).post(`/api/members/${m._id}/plans/draft`).set(auth(t.trainerToken)).send({ type: 'workout' });
    expect(draft.status).toBe(200);
    const saved = await request(app).post(`/api/members/${m._id}/plans`).set(auth(t.trainerToken)).send({ type: 'workout', content: draft.body.content });
    expect(saved.status).toBe(201);
    const dietDraft = await request(app).post(`/api/members/${m._id}/plans/draft`).set(auth(t.trainerToken)).send({ type: 'diet' });
    expect((await request(app).post(`/api/members/${m._id}/plans`).set(auth(t.trainerToken)).send({ type: 'diet', content: dietDraft.body.content })).status).toBe(201);
  });

  it('is told a phone number is taken without being shown whose it is', async () => {
    await request(app).post('/api/members').set(auth(t.managerToken)).send(body({ name: 'Someone Else', phone: '9660000005' }));
    const res = await request(app).post('/api/members/phone-check').set(auth(t.trainerToken)).send({ phone: '9660000005' });
    expect(res.body).toEqual({ matches: [], duplicate: true });
    const mgr = await request(app).post('/api/members/phone-check').set(auth(t.managerToken)).send({ phone: '9660000005' });
    expect(mgr.body.matches[0].name).toBe('Someone Else');
  });

  it('still counts against the plan\'s member limit', async () => {
    const Tenant = require('../models/Tenant');
    await Tenant.updateOne({ _id: t.tenant._id }, { maxMembers: await Member.countDocuments({ tenantId: t.tenant._id }) });
    const res = await request(app).post('/api/members').set(auth(t.trainerToken)).send(body({ phone: '9660000006' }));
    expect(res.status).toBe(402);
  });
});
