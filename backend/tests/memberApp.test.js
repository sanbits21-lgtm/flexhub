const { app, request, connect, disconnect, seedTenant, createMember, auth } = require('./helpers');
const Equipment = require('../models/Equipment');
const Member = require('../models/Member');

// The rule-based generator must be what runs here: no key, no network, no cost.
delete process.env.ANTHROPIC_API_KEY;

// 1x1 transparent PNG.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

let t; let other; let me; let meToken; let peer; let peerToken;

const issueAndLogin = async (managerToken, member) => {
  const access = await request(app).post(`/api/members/${member._id}/app-access`).set(auth(managerToken));
  expect(access.status).toBe(200);
  const login = await request(app).post('/api/member-auth/login').send({ identifier: access.body.memberCode, password: access.body.password });
  expect(login.status).toBe(200);
  return { token: login.body.token, access: access.body };
};

beforeAll(async () => {
  await connect();
  t = await seedTenant('mapp');
  other = await seedTenant('mapp-other');
  me = await createMember(t.managerToken, { branchId: t.branch._id.toString(), planId: t.plan._id.toString(), name: 'Me Member', phone: '9600000001' });
  peer = await createMember(t.managerToken, { branchId: t.branch._id.toString(), planId: t.plan._id.toString(), name: 'Peer Member', phone: '9600000002' });
  ({ token: meToken } = await issueAndLogin(t.managerToken, me));
  ({ token: peerToken } = await issueAndLogin(t.managerToken, peer));
  await Equipment.create([
    { tenantId: t.tenant._id, branchId: t.branch._id, name: 'Treadmill', category: 'Cardio' },
    { tenantId: t.tenant._id, branchId: t.branch._id, name: 'Old Bike', category: 'Cardio', status: 'retired' },
    { tenantId: other.tenant._id, branchId: other.branch._id, name: 'Other Gym Rack', category: 'Strength' },
  ]);
}, 90000);
afterAll(disconnect);

describe('app access', () => {
  it('lets staff issue a temporary password, which logs the member in by member code', async () => {
    // Issuing again is a password reset: it signs out the old session, so carry on with the new one.
    const { token, access } = await issueAndLogin(t.managerToken, me);
    meToken = token;
    expect(access.password).toHaveLength(10);
  });

  it('refuses a trainer or another gym issuing access', async () => {
    expect((await request(app).post(`/api/members/${me._id}/app-access`).set(auth(t.trainerToken))).status).toBe(403);
    expect((await request(app).post(`/api/members/${me._id}/app-access`).set(auth(other.managerToken))).status).toBe(404);
  });

  it('never stores the password readable', async () => {
    const doc = await Member.findById(me._id);
    expect(doc.password).toMatch(/^\$2[aby]\$/);
  });

  it('changes the password only with the current one', async () => {
    const bad = await request(app).put('/api/member-app/me/password').set(auth(meToken)).send({ currentPassword: 'nope', newPassword: 'NewPassw0rd!' });
    // 400 and not 401: 401 means "your session is bad" and signs the member out of the app.
    expect(bad.status).toBe(400);
    expect(bad.body.message).toMatch(/incorrect/i);
    const short = await request(app).put('/api/member-app/me/password').set(auth(meToken)).send({ currentPassword: 'x', newPassword: 'short' });
    expect(short.status).toBe(400);
  });
});

describe('member-only boundary', () => {
  it('rejects staff tokens on member endpoints', async () => {
    expect((await request(app).get('/api/member-app/me').set(auth(t.managerToken))).status).toBe(403);
  });
  it('still blocks members from the staff equipment/staff routes', async () => {
    expect((await request(app).get('/api/equipment').set(auth(meToken))).status).toBe(403);
    expect((await request(app).get('/api/staff').set(auth(meToken))).status).toBe(403);
  });
});

describe('profile', () => {
  it('returns the profile without secrets', async () => {
    const res = await request(app).get('/api/member-app/me').set(auth(meToken));
    expect(res.status).toBe(200);
    expect(res.body.memberCode).toBe(me.memberCode);
    expect(res.body.password).toBeUndefined();
    expect(res.body.qrCode).toBeUndefined();
  });

  it('updates self-service fields and records weight/height as dated body metrics', async () => {
    const res = await request(app).put('/api/member-app/me').set(auth(meToken)).send({
      name: 'Me Renamed', weightKg: 72.5, heightCm: 170, healthNotes: 'Mild asthma', fitnessGoal: 'lose_fat', dietPreference: 'veg', dob: '1995-04-02',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Me Renamed', weightKg: 72.5, heightCm: 170, fitnessGoal: 'lose_fat' });
    const doc = await Member.findById(me._id);
    expect(doc.bodyMetrics).toHaveLength(1);
  });

  it('rejects fields a member must not control', async () => {
    for (const body of [{ email: 'x@y.com' }, { phone: '1' }, { membershipEnd: '2099-01-01' }, { tenantId: other.tenant._id.toString() }, { password: 'Hacked123!' }]) {
      const res = await request(app).put('/api/member-app/me').set(auth(meToken)).send(body);
      expect(res.status).toBe(400);
    }
  });

  it('rejects implausible body values', async () => {
    expect((await request(app).put('/api/member-app/me').set(auth(meToken)).send({ weightKg: 5 })).status).toBe(400);
    expect((await request(app).put('/api/member-app/me').set(auth(meToken)).send({ heightCm: 900 })).status).toBe(400);
  });
});

describe('photo', () => {
  it('accepts a real image and serves it back to the owner', async () => {
    const up = await request(app).put('/api/member-app/me/photo').set(auth(meToken)).send({ image: `data:image/png;base64,${PNG}` });
    expect(up.status).toBe(200);
    const get = await request(app).get(`/api/member-app/photo/${me._id}`).set(auth(meToken));
    expect(get.status).toBe(200);
    expect(get.headers['content-type']).toBe('image/png');
  });

  it('rejects a non-image even if it claims to be one', async () => {
    const text = Buffer.from('<script>alert(1)</script>').toString('base64');
    const res = await request(app).put('/api/member-app/me/photo').set(auth(meToken)).send({ image: `data:image/png;base64,${text}` });
    expect(res.status).toBe(400);
  });

  it('rejects a photo over 1 MB', async () => {
    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(1024 * 1024)]).toString('base64');
    const res = await request(app).put('/api/member-app/me/photo').set(auth(meToken)).send({ image: big });
    expect(res.status).toBe(413);
  });

  it('hides a photo from other members and from other gyms, but not the gym\'s own staff', async () => {
    expect((await request(app).get(`/api/member-app/photo/${me._id}`).set(auth(peerToken))).status).toBe(403);
    expect((await request(app).get(`/api/member-app/photo/${me._id}`).set(auth(other.managerToken))).status).toBe(403);
    expect((await request(app).get(`/api/member-app/photo/${me._id}`).set(auth(t.managerToken))).status).toBe(200);
  });
});

describe('branch equipment and trainers (read-only)', () => {
  it('lists only this branch\'s non-retired equipment', async () => {
    const res = await request(app).get('/api/member-app/equipment').set(auth(meToken));
    expect(res.status).toBe(200);
    expect(res.body.map((e) => e.name)).toEqual(['Treadmill']);
  });

  it('lists trainers by name and specialization only', async () => {
    const res = await request(app).get('/api/member-app/trainers').set(auth(meToken));
    expect(res.status).toBe(200);
    expect(res.body.trainers).toHaveLength(1);
    expect(Object.keys(res.body.trainers[0]).every((k) => ['_id', 'name', 'specialization'].includes(k))).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/salary|phone|email|password/);
  });
});

describe('workout and diet plans', () => {
  it('generates a rule-based workout and diet and returns them as the latest plans', async () => {
    const w = await request(app).post('/api/member-app/plans/generate').set(auth(meToken)).send({ type: 'workout', daysPerWeek: 4 });
    expect(w.status).toBe(201);
    expect(w.body.source).toBe('rules');
    expect(w.body.content.days).toHaveLength(4);
    expect(w.body.content.disclaimer).toMatch(/not medical advice/);
    // The member has a health note, so the plan must say to check with a doctor.
    expect(w.body.content.notes.join(' ')).toMatch(/doctor/i);

    const d = await request(app).post('/api/member-app/plans/generate').set(auth(meToken)).send({ type: 'diet' });
    expect(d.status).toBe(201);
    expect(JSON.stringify(d.body.content)).not.toMatch(/chicken|fish|egg/i); // dietPreference is veg
    expect(d.body.content.caloriesTarget).toBeGreaterThan(1200);

    const plans = await request(app).get('/api/member-app/plans').set(auth(meToken));
    expect(plans.body.workout.content.title).toBe(w.body.content.title);
    expect(plans.body.diet.content.title).toBe(d.body.content.title);
  });

  it('does not show one member another member\'s plans', async () => {
    const res = await request(app).get('/api/member-app/plans').set(auth(peerToken));
    expect(res.body.workout).toBeNull();
    expect(res.body.diet).toBeNull();
  });

  it('rejects an unknown plan type', async () => {
    expect((await request(app).post('/api/member-app/plans/generate').set(auth(meToken)).send({ type: 'steroids' })).status).toBe(400);
  });

  it('caps generation at 5 per day', async () => {
    let last;
    for (let i = 0; i < 6; i += 1) {
      last = await request(app).post('/api/member-app/plans/generate').set(auth(meToken)).send({ type: 'workout' });
      if (last.status === 429) break;
    }
    expect(last.status).toBe(429);
  });
});

describe('delete my account', () => {
  let victim; let vToken; let vPass;
  beforeAll(async () => {
    victim = await createMember(t.managerToken, { branchId: t.branch._id.toString(), planId: t.plan._id.toString(), name: 'Leaving Member', phone: '9600000099', email: 'leaving@example.com' });
    const r = await issueAndLogin(t.managerToken, victim);
    vToken = r.token; vPass = r.access.password;
    await request(app).post('/api/member-app/plans/generate').set(auth(vToken)).send({ type: 'workout' });
  });

  it('needs the password, and rejects a wrong one without changing anything', async () => {
    expect((await request(app).delete('/api/member-app/me').set(auth(vToken)).send({})).status).toBe(400);
    expect((await request(app).delete('/api/member-app/me').set(auth(vToken)).send({ password: 'nope-nope' })).status).toBe(400);
    expect((await Member.findById(victim._id)).name).toBe('Leaving Member');
  });

  it('erases personal data, keeps the record, and signs the member out for good', async () => {
    const res = await request(app).delete('/api/member-app/me').set(auth(vToken)).send({ password: vPass });
    expect(res.status).toBe(200);
    const m = await Member.findById(victim._id);
    expect(m).toMatchObject({ name: 'Deleted member', phone: 'deleted', isActive: false, membershipStatus: 'cancelled' });
    expect(m.email).toBeUndefined();
    expect(m.memberCode).toBe(victim.memberCode);
    expect(await require('../models/MemberPlan').countDocuments({ memberId: victim._id })).toBe(0);
    // old token and old password both stop working
    expect((await request(app).get('/api/member-app/me').set(auth(vToken))).status).toBe(401);
    expect((await request(app).post('/api/member-auth/login').send({ identifier: victim.memberCode, password: vPass })).status).toBe(401);
  });

  it('frees the email for a new member at the same gym', async () => {
    const again = await request(app).post('/api/members').set(auth(t.managerToken)).send({ branchId: t.branch._id.toString(), membershipPlanId: t.plan._id.toString(), name: 'Returning', phone: '9600000098', email: 'leaving@example.com' });
    expect(again.status).toBe(201);
  });
});
