const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { app, request, connect, disconnect, seedTenant, createMember, login, auth, PASSWORD } = require('./helpers');
const Tenant = require('../models/Tenant');
const Branch = require('../models/Branch');
const User = require('../models/User');
const Member = require('../models/Member');
const MembershipPlan = require('../models/MembershipPlan');
const ClassSession = require('../models/ClassSession');
const Booking = require('../models/Booking');
const PtSession = require('../models/PtSession');
const Attendance = require('../models/Attendance');
const Rating = require('../models/Rating');
const MemberPayment = require('../models/MemberPayment');
const MemberPlan = require('../models/MemberPlan');
const Equipment = require('../models/Equipment');
const ClassType = require('../models/ClassType');

delete process.env.ANTHROPIC_API_KEY;

// GYM ISOLATION, ATTACKED.
//
// Two gyms, A and B, each with a full set of data. Everything below is done as gym A's people (owner, branch
// manager, trainer, member) trying to reach gym B: through every route the app has, with B's ids in the path,
// in the body and in the query string. The test then checks, from the database, that
//   * nothing of B's appeared in any response,
//   * nothing of B's changed,
//   * nothing in A now points at anything of B's.
// The routes are read from the running app, not from a list written here, so a route added next year is
// attacked too, and one added without a sign-in check fails the first test.

const GYM_MARK = 'zzbsecret'; // every name in gym B contains it, so a leak is a substring away

// ---------- reading the routes from the app ----------
const mountPath = (layer) => {
  if (layer.regexp.fast_slash) return '';
  const m = layer.regexp.source.match(/^\^((?:\\\/[^\\?()]+)+)\\\/\?\(\?=\\\/\|\$\)$/);
  return m ? m[1].replace(/\\\//g, '/') : '';
};
const listRoutes = () => {
  const out = [];
  const walk = (stack, prefix) => stack.forEach((layer) => {
    if (layer.route && typeof layer.route.path === 'string') {
      Object.keys(layer.route.methods).forEach((m) => out.push({ method: m.toUpperCase(), path: prefix + layer.route.path }));
    } else if (layer.name === 'router' && layer.handle.stack) {
      walk(layer.handle.stack, prefix + mountPath(layer));
    }
  });
  walk(app._router.stack, '');
  return out;
};

// Routes that are public on purpose. Anything else must refuse a request with no sign-in.
const PUBLIC = [
  /^GET \/health$/, /^GET \/readyz$/, /^GET \/privacy$/, /^GET \/terms$/, /^GET \/member\.webmanifest$/, /^POST \/api\/csp-report$/,
  /^(GET|POST) \/api\/public\//,
  /^POST \/api\/auth\/(login|refresh|logout|forgot-password|reset-password)$/,
  /^POST \/api\/member-auth\/(login|refresh|logout|forgot-password|reset-password)$/,
];
const isPublic = (r) => PUBLIC.some((rx) => rx.test(`${r.method} ${r.path}`));

// ---------- two gyms ----------
const workout = () => ({
  title: 'Plan', summary: '', daysPerWeek: 1,
  days: [{ day: 'Day 1', focus: 'All', exercises: [{ name: 'Squat', sets: 3, reps: '10', restSec: 60, equipment: 'Barbell', notes: '' }] }],
  notes: [],
});

const buildGym = async (label) => {
  const t = await seedTenant(label);
  const features = Object.fromEntries(['features:ratings', 'features:qrCheckIn', 'features:personalTraining', 'features:memberPayments', 'features:bulkUpload', 'features:upiPayments', 'pages:classes', 'pages:equipment', 'pages:attendance', 'pages:reports', 'pages:paymentSettings', 'pages:trainerReport', 'features:branding'].map((k) => [`features.${k}`, true]));
  await Tenant.updateOne({ _id: t.tenant._id }, { maxBranches: 5, maxMembers: 200, $set: features });
  await MembershipPlan.updateOne({ _id: t.plan._id }, { name: `${label}-plan` });
  const north = await Branch.create({ tenantId: t.tenant._id, name: `${label} North` });
  const northManager = await User.create({ name: `${label} north manager`, email: `northmgr-${label}-${Date.now()}@example.com`, phone: '9000000055', password: PASSWORD, role: 'branch-manager', tenantId: t.tenant._id, branchId: north._id });
  const northManagerToken = await login(northManager.email);
  const branchPlan = await MembershipPlan.create({ tenantId: t.tenant._id, branchId: north._id, name: `${label}-branchplan`, durationUnit: 'monthly', price: 700 });

  const base = { branchId: t.branch._id.toString(), planId: t.plan._id.toString() };
  const member = await createMember(t.managerToken, { ...base, name: `${label} member`, phone: '9700000001' });
  const northMember = await createMember(t.adminToken, { branchId: north._id.toString(), planId: branchPlan._id.toString(), name: `${label} north member`, phone: '9700000002' });
  await Member.updateOne({ _id: member._id }, { assignedTrainerId: t.trainer._id, photoUrl: `${label}-photo.png` });
  await Member.updateOne({ _id: northMember._id }, { photoUrl: `${label}-north-photo.png` });
  const access = await request(app).post(`/api/members/${member._id}/app-access`).set(auth(t.managerToken));
  const memberToken = (await request(app).post('/api/member-auth/login').send({ identifier: access.body.memberCode, password: access.body.password })).body.token;

  const classType = (await request(app).post('/api/class-types').set(auth(t.adminToken)).send({ name: `${label} class`, durationMinutes: 45, defaultCapacity: 10 })).body;
  const now = Date.now();
  const classSession = await ClassSession.create({ tenantId: t.tenant._id, branchId: t.branch._id, classTypeId: classType._id, trainerId: t.trainer._id, startAt: new Date(now + 86400000), endAt: new Date(now + 90000000) });
  const booking = await Booking.create({ tenantId: t.tenant._id, branchId: t.branch._id, classSessionId: classSession._id, memberId: member._id });
  const ptSession = await PtSession.create({ tenantId: t.tenant._id, branchId: t.branch._id, trainerId: t.trainer._id, memberId: member._id, startAt: new Date(now + 172800000), endAt: new Date(now + 176400000) });
  const equipment = (await request(app).post('/api/equipment').set(auth(t.managerToken)).send({ name: `${label} treadmill` })).body;
  const payment = (await request(app).post('/api/payments').set(auth(t.managerToken)).send({ memberId: member._id, membershipPlanId: t.plan._id.toString(), amount: 1000, method: 'cash', status: 'paid' })).body;
  const attendance = await Attendance.create({ tenantId: t.tenant._id, branchId: t.branch._id, memberId: member._id });
  await Rating.create({ tenantId: t.tenant._id, branchId: t.branch._id, memberId: member._id, targetType: 'gym', stars: 5, comment: `${label} comment` });
  const staffPlan = (await request(app).post(`/api/members/${member._id}/plans`).set(auth(t.managerToken)).send({ type: 'workout', content: workout() })).body;
  const progress = await request(app).post('/api/member-app/progress').set(auth(memberToken)).send({ weightKg: 80 });
  const entryId = progress.body.metrics[0]._id;

  return {
    t, label, northManagerToken, memberToken,
    ids: {
      tenant: t.tenant._id.toString(), branch: t.branch._id.toString(), north: north._id.toString(), plan: t.plan._id.toString(), branchPlan: branchPlan._id.toString(),
      member: member._id, northMember: northMember._id, trainer: t.trainer._id.toString(), manager: t.manager._id.toString(), admin: t.admin._id.toString(),
      classType: classType._id, session: classSession._id.toString(), booking: booking._id.toString(), pt: ptSession._id.toString(), equipment: equipment._id,
      payment: payment._id, attendance: attendance._id.toString(), memberPlan: staffPlan._id, entry: entryId,
    },
  };
};

// Everything in the database that belongs to a gym, as one comparable string.
const MODELS = [User, Member, Branch, MembershipPlan, ClassSession, ClassType, Booking, PtSession, Attendance, Rating, MemberPayment, MemberPlan, Equipment];
const gymState = async (tenantId) => {
  const parts = [];
  for (const Model of MODELS) {
    const docs = await Model.find({ tenantId }).sort({ _id: 1 }).lean();
    // sign-in bookkeeping changes when anyone signs in; it is not data an attacker could have touched
    parts.push(JSON.stringify(docs.map(({ lastLoginAt, updatedAt, ...rest }) => rest)));
  }
  const tenant = await Tenant.findById(tenantId).lean();
  parts.push(JSON.stringify((({ updatedAt, ...rest }) => rest)(tenant)));
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex');
};

let A; let B; let attackers; let bIdList;
const leaks = (res) => {
  const hay = `${JSON.stringify(res.body)}${res.text || ''}`.toLowerCase();
  if (hay.includes(GYM_MARK)) return `contains "${GYM_MARK}"`;
  const id = bIdList.find((x) => hay.includes(String(x).toLowerCase()));
  return id ? `contains gym B's id ${id}` : null;
};

beforeAll(async () => {
  await connect();
  A = await buildGym('iso-a');
  B = await buildGym('zzbsecret');
  bIdList = Object.values(B.ids).map(String).filter((v) => /^[0-9a-f]{24}$/i.test(v));
  attackers = {
    'gym A owner': A.t.adminToken,
    'gym A branch manager': A.t.managerToken,
    'gym A trainer': A.t.trainerToken,
    'gym A member': A.memberToken,
  };
}, 180000);
afterAll(disconnect);

// ============================================================================================
describe('every route asks who you are', () => {
  it('refuses a request with no sign-in, on every route that is not public on purpose', async () => {
    const routes = listRoutes().filter((r) => !isPublic(r));
    expect(routes.length).toBeGreaterThan(80); // the enumeration is really reading the app
    const open = [];
    for (const r of routes) {
      const path = r.path.replace(/:\w+/g, B.ids.member);
      const res = await request(app)[r.method.toLowerCase()](path).send({});
      if (res.status !== 401) open.push(`${r.method} ${r.path} -> ${res.status}`);
    }
    expect(open).toEqual([]);
  }, 120000);
});

// ============================================================================================
describe('gym A cannot reach gym B through any route', () => {
  it('reads nothing of B\'s, changes nothing of B\'s, and leaves nothing in A pointing at B', async () => {
    const before = await gymState(B.ids.tenant);
    const routes = listRoutes().filter((r) => !isPublic(r));
    // Which of B's records make sense to try in a route's :id. A route whose prefix is not listed gets every kind,
    // so a newly added route is attacked with everything until someone adds it here. Two decoys go everywhere.
    const ALL_KINDS = ['member', 'northMember', 'branch', 'north', 'plan', 'branchPlan', 'classType', 'session', 'booking', 'pt', 'equipment', 'payment', 'trainer', 'manager', 'admin', 'memberPlan', 'entry', 'tenant'];
    const BY_PREFIX = {
      '/api/members': ['member', 'northMember'], '/api/branches': ['branch', 'north'], '/api/staff': ['trainer', 'manager', 'admin'],
      '/api/payments': ['payment', 'member'], '/api/membership-plans': ['plan', 'branchPlan'], '/api/class-types': ['classType'],
      '/api/class-sessions': ['session', 'classType'], '/api/bookings': ['booking', 'session'], '/api/pt-sessions': ['pt'],
      '/api/member-app/sessions': ['pt', 'session'], '/api/equipment': ['equipment'], '/api/tenants': ['tenant'],
      '/api/platform-admins': ['admin', 'tenant'], '/api/packages': ['tenant'], '/api/attendance': ['member', 'attendance'],
      '/api/profile': ['trainer', 'manager', 'admin'],
    };
    const kindsFor = (path) => {
      const prefix = Object.keys(BY_PREFIX).find((p) => path.startsWith(p));
      return prefix ? [...new Set([...BY_PREFIX[prefix], 'tenant', 'member'])] : ALL_KINDS;
    };
    const fixed = { memberId: B.ids.member, trainerId: B.ids.trainer, userId: B.ids.trainer, branchId: B.ids.branch, planId: B.ids.memberPlan, entryId: B.ids.entry };
    const smuggle = `tenantId=${B.ids.tenant}&branchId=${B.ids.branch}&memberId=${B.ids.member}&trainerId=${B.ids.trainer}&classSessionId=${B.ids.session}`;
    const body = {
      tenantId: B.ids.tenant, branchId: B.ids.branch, memberId: B.ids.member, membershipPlanId: B.ids.plan, planId: B.ids.plan, trainerId: B.ids.trainer,
      assignedTrainerId: B.ids.trainer, classTypeId: B.ids.classType, classSessionId: B.ids.session, attendanceId: B.ids.attendance,
      name: 'Smuggler', phone: '9000000077', email: 'smuggler@example.com', amount: 1, method: 'cash', status: 'paid', type: 'workout', stars: 3,
      startAt: new Date(Date.now() + 5 * 86400000).toISOString(), endAt: new Date(Date.now() + 5 * 86400000 + 3600000).toISOString(), upiId: 'smuggler@bank',
    };

    const problems = [];
    let sent = 0;
    for (const [who, token] of Object.entries(attackers)) {
      for (const r of routes) {
        const params = r.path.match(/:\w+/g) || [];
        const needsId = params.includes(':id');
        const idKinds = needsId ? kindsFor(r.path) : [null];
        for (const kind of idKinds) {
          const path = r.path.replace(/:(\w+)/g, (_, name) => (name === 'id' ? B.ids[kind] : (fixed[name] || B.ids.member)));
          const variants = r.method === 'GET' ? [path, `${path}${path.includes('?') ? '&' : '?'}${smuggle}`] : [path];
          for (const url of variants) {
            const res = await request(app)[r.method.toLowerCase()](url).set(auth(token)).send(r.method === 'GET' ? undefined : body);
            sent += 1;
            const where = `${who}: ${r.method} ${url.split('?')[0]}${url.includes('?') ? ' (+smuggled query)' : ''}`;
            if (res.status >= 500) problems.push(`${where} -> server error ${res.status}`);
            const leak = leaks(res);
            if (leak) problems.push(`${where} -> ${res.status} response ${leak}`);
          }
        }
      }
    }
    expect(sent).toBeGreaterThan(600);
    expect(problems).toEqual([]);

    // B is exactly as it was
    expect(await gymState(B.ids.tenant)).toBe(before);

    // and nothing in A points at B: every record of A, searched for every id of B
    const referencing = [];
    for (const Model of MODELS) {
      const docs = await Model.find({ tenantId: A.ids.tenant }).lean();
      const text = JSON.stringify(docs).toLowerCase();
      bIdList.filter((id) => text.includes(id.toLowerCase())).forEach((id) => referencing.push(`${Model.modelName} of A mentions B's ${id}`));
      if (text.includes(GYM_MARK)) referencing.push(`${Model.modelName} of A mentions "${GYM_MARK}"`);
    }
    expect(referencing).toEqual([]);
  }, 900000);

  it('is a real test: B\'s own people see B\'s data, and the leak check would notice it', async () => {
    const own = await request(app).get(`/api/members/${B.ids.member}`).set(auth(B.t.adminToken));
    expect(own.status).toBe(200);
    expect(leaks(own)).not.toBeNull(); // the detector fires on B's data
    expect((await request(app).get('/api/payments').set(auth(B.t.adminToken))).body.payments.length).toBeGreaterThan(0);
    // and A's people see their own through the same routes (the routes work; they just do not cross)
    expect(leaks(await request(app).get(`/api/members/${A.ids.member}`).set(auth(A.t.adminToken)))).toBeNull();
    expect((await request(app).get(`/api/members/${A.ids.member}`).set(auth(A.t.adminToken))).status).toBe(200);
  });
});

// ============================================================================================
describe('a request that mixes A\'s own records with ONE of B\'s is refused, and nothing is stored', () => {
  const sendAs = (token, method, url, body) => request(app)[method](url).set(auth(token)).send(body);
  const soon = (hours) => new Date(Date.now() + hours * 3600000).toISOString();

  it('payments: another gym\'s plan or member', async () => {
    const own = { memberId: A.ids.member, amount: 100, method: 'cash', status: 'paid' };
    expect((await sendAs(A.t.adminToken, 'post', '/api/payments', { ...own, membershipPlanId: B.ids.plan })).status).toBe(400);
    expect((await sendAs(A.t.adminToken, 'post', '/api/payments', { ...own, memberId: B.ids.member })).status).toBe(404);
    expect((await sendAs(A.t.adminToken, 'post', '/api/payments', { ...own, membershipPlanId: A.ids.plan })).status).toBe(201); // the same request with A's own plan works
    // a plan made for another BRANCH of the same gym is refused too
    expect((await sendAs(A.t.adminToken, 'post', '/api/payments', { ...own, membershipPlanId: A.ids.branchPlan })).status).toBe(400);
  });

  it('classes: another gym\'s trainer or class type (create, batch, edit)', async () => {
    const own = { classTypeId: A.ids.classType, branchId: A.ids.branch, startAt: soon(30), endAt: soon(31) };
    expect((await sendAs(A.t.adminToken, 'post', '/api/class-sessions', { ...own, trainerId: B.ids.trainer })).status).toBe(400);
    expect((await sendAs(A.t.adminToken, 'post', '/api/class-sessions', { ...own, classTypeId: B.ids.classType })).status).toBe(400);
    const batch = { classTypeId: A.ids.classType, branchId: A.ids.branch, startDate: '2030-01-07', endDate: '2030-01-20', daysOfWeek: [1], startTime: '07:00' };
    expect((await sendAs(A.t.adminToken, 'post', '/api/class-sessions/batch', { ...batch, trainerId: B.ids.trainer })).status).toBe(400);
    expect(await ClassSession.countDocuments({ tenantId: A.ids.tenant, startAt: { $gte: new Date('2030-01-01') } })).toBe(0); // a bad batch creates none of it
    expect((await sendAs(A.t.adminToken, 'put', `/api/class-sessions/${A.ids.session}`, { trainerId: B.ids.trainer })).status).toBe(400);
    expect(String((await ClassSession.findById(A.ids.session)).trainerId)).toBe(A.ids.trainer);
    expect((await sendAs(A.t.adminToken, 'post', '/api/class-sessions', { ...own, trainerId: A.ids.trainer })).status).toBe(201); // A's own trainer works
  });

  it('bookings, training sessions and attendance: another gym\'s member, session or trainer', async () => {
    expect((await sendAs(A.t.managerToken, 'post', '/api/bookings', { classSessionId: A.ids.session, memberId: B.ids.member })).status).toBe(400);
    expect((await sendAs(A.t.managerToken, 'post', '/api/bookings', { classSessionId: B.ids.session, memberId: A.ids.member })).status).toBe(404);
    expect((await sendAs(A.t.managerToken, 'post', '/api/pt-sessions', { memberId: A.ids.member, trainerId: B.ids.trainer, startAt: soon(50), endAt: soon(51) })).status).toBe(400);
    expect((await sendAs(A.t.managerToken, 'post', '/api/pt-sessions', { memberId: B.ids.member, trainerId: A.ids.trainer, startAt: soon(50), endAt: soon(51) })).status).toBe(404);
    expect((await sendAs(A.t.managerToken, 'post', '/api/attendance/check-in', { memberId: B.ids.member })).status).toBe(404);
    // B's member's real pass, scanned at A's desk
    const pass = jwt.sign({ purpose: 'checkin', sub: B.ids.member }, process.env.JWT_SECRET, { expiresIn: 120 });
    expect((await sendAs(A.t.managerToken, 'post', '/api/attendance/scan', { token: pass })).status).toBe(404);
  });

  it('members: another gym\'s branch, trainer or plan, on create, edit and renewal; a smuggled tenantId is overwritten', async () => {
    const own = { name: 'Iso Member', phone: '9710000001', branchId: A.ids.branch };
    expect((await sendAs(A.t.adminToken, 'post', '/api/members', { ...own, branchId: B.ids.branch })).status).toBe(400);
    expect((await sendAs(A.t.adminToken, 'post', '/api/members', { ...own, assignedTrainerId: B.ids.trainer })).status).toBe(400);
    expect((await sendAs(A.t.adminToken, 'post', '/api/members', { ...own, membershipPlanId: B.ids.plan })).status).toBe(400);
    expect((await sendAs(A.t.adminToken, 'put', `/api/members/${A.ids.member}`, { assignedTrainerId: B.ids.trainer })).status).toBe(400);
    expect((await sendAs(A.t.adminToken, 'put', `/api/members/${A.ids.member}`, { membershipPlanId: B.ids.plan })).status).toBe(400);
    expect((await sendAs(A.t.adminToken, 'post', `/api/members/${A.ids.member}/renew`, { membershipPlanId: B.ids.plan })).status).toBe(400);
    // a plan made for A's north branch cannot be put on a member of A's main branch
    expect((await sendAs(A.t.adminToken, 'post', '/api/members', { ...own, phone: '9710000002', membershipPlanId: A.ids.branchPlan })).status).toBe(400);
    const created = await sendAs(A.t.adminToken, 'post', '/api/members', { ...own, phone: '9710000003', tenantId: B.ids.tenant });
    expect(created.status).toBe(201);
    expect(String(created.body.tenantId)).toBe(A.ids.tenant); // the smuggled tenantId was replaced by the caller's own
  });

  it('setup: another gym\'s branch for staff, equipment, plans, class types, managers and payment accounts', async () => {
    expect((await sendAs(A.t.adminToken, 'post', '/api/staff', { name: 'Iso Trainer', email: 'iso-trainer@example.com', phone: '9720000001', password: 'Orchid-Lantern-47!', role: 'trainer', branchId: B.ids.branch })).status).toBe(400);
    expect((await sendAs(A.t.adminToken, 'post', '/api/equipment', { name: 'Smuggled', branchId: B.ids.branch })).status).toBe(400);
    expect((await sendAs(A.t.adminToken, 'post', '/api/membership-plans', { name: 'Smuggled', durationUnit: 'monthly', price: 1, branchId: B.ids.branch })).status).toBe(400);
    expect((await sendAs(A.t.adminToken, 'post', '/api/class-types', { name: 'Smuggled', durationMinutes: 30, branchId: B.ids.branch })).status).toBe(400);
    expect((await sendAs(A.t.adminToken, 'post', `/api/branches/${B.ids.branch}/managers`, { name: 'Smuggled', email: 'smuggled-mgr@example.com', phone: '9720000002', password: 'Orchid-Lantern-47!' })).status).toBe(404);
    expect((await sendAs(A.t.adminToken, 'put', `/api/tenant-settings/branches/${B.ids.branch}/payment`, { upiId: 'smuggler@bank' })).status).toBe(404);
    expect(await User.countDocuments({ email: { $in: ['iso-trainer@example.com', 'smuggled-mgr@example.com'] } })).toBe(0);
  });

  it('the member app: another gym\'s trainer, session, entry or photo', async () => {
    const m = A.memberToken;
    expect((await sendAs(m, 'put', `/api/member-app/ratings/trainers/${B.ids.trainer}`, { stars: 1 })).status).toBe(404);
    expect((await sendAs(m, 'post', `/api/member-app/sessions/${B.ids.pt}/cancel`)).status).toBe(404);
    expect((await sendAs(m, 'delete', `/api/member-app/progress/${B.ids.entry}`)).status).toBe(404);
    expect((await sendAs(m, 'get', `/api/member-app/photo/${B.ids.member}`)).status).toBe(403);
    // another member of the same gym is no better
    expect((await sendAs(m, 'get', `/api/member-app/photo/${A.ids.northMember}`)).status).toBe(403);
    expect((await sendAs(m, 'get', `/api/attendance/member/${B.ids.member}`)).status).toBe(403);
    expect((await sendAs(m, 'get', '/api/branches')).status).toBe(403); // a member is not a manager
  });
});

// ============================================================================================
describe('inside one gym, a branch and a trainer stay inside their own lines', () => {
  it('a branch manager cannot read or change another branch\'s members, photos or payments', async () => {
    const mgr = A.t.managerToken; // runs the main branch
    expect((await request(app).get(`/api/members/${A.ids.northMember}`).set(auth(mgr))).status).toBe(404);
    expect((await request(app).put(`/api/members/${A.ids.northMember}`).set(auth(mgr)).send({ name: 'Renamed' })).status).toBe(404);
    expect((await request(app).get(`/api/member-app/photo/${A.ids.northMember}`).set(auth(mgr))).status).toBe(403);
    expect((await request(app).get(`/api/member-app/photo/${A.ids.member}`).set(auth(mgr))).status).not.toBe(403); // their own branch: allowed
    expect((await request(app).post('/api/payments').set(auth(mgr)).send({ memberId: A.ids.northMember, amount: 1, method: 'cash' })).status).toBe(404);
    // the north manager, in turn, cannot reach the main branch
    expect((await request(app).get(`/api/members/${A.ids.member}`).set(auth(A.northManagerToken))).status).toBe(404);
    expect((await Member.findById(A.ids.northMember)).name).toBe('iso-a north member');
  });

  it('a trainer sees only their assigned members, their own classes\' bookings, and photos of assigned members', async () => {
    const trainer = A.t.trainerToken;
    const other = await User.create({ name: 'Other Trainer', email: `other-trainer-${Date.now()}@example.com`, phone: '9000000066', password: PASSWORD, role: 'trainer', tenantId: A.t.tenant._id, branchId: A.t.branch._id });
    const otherSession = await ClassSession.create({ tenantId: A.t.tenant._id, branchId: A.t.branch._id, classTypeId: A.ids.classType, trainerId: other._id, startAt: new Date(Date.now() + 8 * 86400000), endAt: new Date(Date.now() + 8 * 86400000 + 3600000) });
    const unassigned = await createMember(A.t.managerToken, { branchId: A.ids.branch, planId: A.ids.plan, name: 'iso-a unassigned', phone: '9730000001' });
    await Member.updateOne({ _id: unassigned._id }, { photoUrl: 'unassigned.png' });
    await Booking.create({ tenantId: A.t.tenant._id, branchId: A.t.branch._id, classSessionId: otherSession._id, memberId: unassigned._id });

    expect((await request(app).get(`/api/members/${unassigned._id}`).set(auth(trainer))).status).toBe(404);
    expect((await request(app).get(`/api/member-app/photo/${unassigned._id}`).set(auth(trainer))).status).toBe(403);
    expect((await request(app).get(`/api/member-app/photo/${A.ids.member}`).set(auth(trainer))).status).not.toBe(403); // assigned to them
    // naming another trainer's session no longer replaces the trainer's own restriction
    const naming = await request(app).get(`/api/bookings?classSessionId=${otherSession._id}`).set(auth(trainer));
    expect(naming.status).toBe(200);
    expect(naming.body).toEqual([]);
    const own = await request(app).get(`/api/bookings?classSessionId=${A.ids.session}`).set(auth(trainer));
    expect(own.body.length).toBeGreaterThanOrEqual(1);
    expect(own.body.every((b) => String(b.classSessionId) === A.ids.session)).toBe(true);
    // and a query operator is refused, not obeyed
    expect((await request(app).get('/api/bookings?classSessionId[$ne]=x').set(auth(trainer))).status).toBe(400);
    expect((await request(app).get('/api/staff?role[$ne]=x').set(auth(A.t.adminToken))).status).toBe(400);
    expect((await request(app).get('/api/class-sessions?trainerId[$ne]=x').set(auth(A.t.adminToken))).status).toBe(400);
  });

  it('platform routes are closed to every role of a gym', async () => {
    for (const [, token] of Object.entries(attackers)) {
      for (const path of ['/api/tenants', `/api/tenants/${B.ids.tenant}`, '/api/platform-admins', '/api/packages', '/api/audit-logs', '/api/platform-settings', '/api/dashboard/platform']) {
        expect([401, 403]).toContain((await request(app).get(path).set(auth(token))).status);
      }
    }
  });
});

// ============================================================================================
describe('the data layer refuses a record that points at another gym, whatever route saved it', () => {
  const pointsAtB = (promise) => expect(promise).rejects.toThrow(/does not belong to this gym/);
  const a = () => ({ tenantId: A.t.tenant._id, branchId: A.t.branch._id });

  it('on create', async () => {
    await pointsAtB(MemberPayment.create({ ...a(), memberId: A.ids.member, membershipPlanId: B.ids.plan, amount: 1, invoiceNumber: `INV-X-${Date.now()}` }));
    await pointsAtB(MemberPayment.create({ ...a(), memberId: B.ids.member, amount: 1, invoiceNumber: `INV-Y-${Date.now()}` }));
    await pointsAtB(ClassSession.create({ ...a(), classTypeId: A.ids.classType, trainerId: B.ids.trainer, startAt: new Date(), endAt: new Date(Date.now() + 1000) }));
    await pointsAtB(ClassSession.create({ ...a(), classTypeId: B.ids.classType, startAt: new Date(), endAt: new Date(Date.now() + 1000) }));
    await pointsAtB(PtSession.create({ ...a(), trainerId: B.ids.trainer, memberId: A.ids.member, startAt: new Date(), endAt: new Date(Date.now() + 1000) }));
    await pointsAtB(Booking.create({ ...a(), classSessionId: B.ids.session, memberId: A.ids.member }));
    await pointsAtB(Attendance.create({ ...a(), memberId: B.ids.member }));
    await pointsAtB(Member.create({ ...a(), name: 'X', phone: '9740000001', password: 'x'.repeat(20), memberCode: `X-${Date.now()}`, qrCode: `q-${Date.now()}`, assignedTrainerId: B.ids.trainer }));
    await pointsAtB(Equipment.create({ tenantId: A.t.tenant._id, branchId: B.ids.branch, name: 'X' }));
    await pointsAtB(User.create({ name: 'X', email: `x-${Date.now()}@example.com`, phone: '9740000002', password: PASSWORD, role: 'branch-manager', tenantId: A.t.tenant._id, branchId: B.ids.branch }));
    await pointsAtB(Rating.create({ ...a(), memberId: A.ids.member, targetType: 'trainer', trainerId: B.ids.trainer, stars: 5 }));
    await pointsAtB(MembershipPlan.create({ tenantId: A.t.tenant._id, branchId: B.ids.branch, name: 'X', durationUnit: 'monthly', price: 1 }));
  });

  it('on a change to an existing record, and accepts the same save with A\'s own reference', async () => {
    const payment = await MemberPayment.findById(A.ids.payment);
    payment.membershipPlanId = B.ids.plan;
    await pointsAtB(payment.save());
    payment.membershipPlanId = A.ids.plan;
    await expect(payment.save()).resolves.toBeTruthy();
    const session = await ClassSession.findById(A.ids.session);
    session.trainerId = B.ids.trainer;
    await pointsAtB(session.save());
  });
});
