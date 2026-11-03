const jwt = require('jsonwebtoken');
const { app, request, connect, disconnect, seedTenant, createMember, auth } = require('./helpers');
const Member = require('../models/Member');
const Tenant = require('../models/Tenant');
const { FEATURE_REGISTRY } = require('../config/featureRegistry');

let A; let B; let mA; let mB;
const day = 86400000;
const setFlag = (tenant, key, value) => Tenant.updateOne({ _id: tenant._id }, { $set: { [`features.${key}`]: value } });
const memberToken = async (token, member) => {
  const a = await request(app).post(`/api/members/${member._id}/app-access`).set(auth(token));
  const l = await request(app).post('/api/member-auth/login').send({ identifier: a.body.memberCode, password: a.body.password });
  return { token: l.body.token, creds: a.body, login: l.body };
};
const newMember = (t, over = {}) => createMember(t.managerToken, { branchId: t.branch._id.toString(), planId: t.plan._id.toString(), ...over });
const pay = (t, body) => request(app).post('/api/payments').set(auth(t.managerToken)).send(body);

beforeAll(async () => {
  await connect();
  A = await seedTenant('hard-a');
  B = await seedTenant('hard-b');
  mA = await newMember(A, { name: 'Alpha', phone: '9710000001' });
  mB = await newMember(B, { name: 'Bravo', phone: '9710000002' });
}, 120000);
afterAll(disconnect);

describe('payments only move along real paths', () => {
  const make = async (status = 'paid') => (await pay(A, { memberId: mA._id, amount: 500, method: 'cash', status })).body;
  const put = (p, status) => request(app).put(`/api/payments/${p._id}`).set(auth(A.managerToken)).send({ status });

  it('allows pending -> paid and paid -> refunded', async () => {
    const p = await make('pending');
    expect((await put(p, 'paid')).status).toBe(200);
    const r = await put(p, 'refunded');
    expect(r.status).toBe(200);
    expect(r.body.paidAt).toBeNull();
  });
  it('refuses refunded -> paid, paid -> pending and pending -> refunded', async () => {
    const refunded = await make('paid'); await put(refunded, 'refunded');
    expect((await put(refunded, 'paid')).status).toBe(400);
    expect((await put(await make('paid'), 'pending')).status).toBe(400);
    expect((await put(await make('pending'), 'refunded')).status).toBe(400);
  });
  it('treats re-sending the same status as a no-op that keeps paidAt', async () => {
    const p = await make('paid');
    const again = await put(p, 'paid');
    expect(again.status).toBe(200);
    expect(new Date(again.body.paidAt).getTime()).toBe(new Date(p.paidAt).getTime());
  });
  it('rejects absurd amounts but still allows a free (100% discount) renewal', async () => {
    expect((await pay(A, { memberId: mA._id, amount: 0 })).status).toBe(400);
    expect((await pay(A, { memberId: mA._id, amount: 1e15 })).status).toBe(400);
    expect((await pay(A, { memberId: mA._id, amount: -5 })).status).toBe(400);
    expect((await request(app).post(`/api/members/${mA._id}/renew`).set(auth(A.managerToken)).send({ amount: 0 })).status).toBe(200);
  });
});

describe('a deactivated member', () => {
  it('cannot be renewed, charged or checked in', async () => {
    const m = await newMember(A, { name: 'Gone Member', phone: '9710000003' });
    await request(app).delete(`/api/members/${m._id}`).set(auth(A.managerToken));
    expect((await request(app).post(`/api/members/${m._id}/renew`).set(auth(A.managerToken)).send({ amount: 100 })).status).toBe(400);
    expect((await pay(A, { memberId: m._id, amount: 50 })).status).toBe(400);
    expect((await request(app).post('/api/attendance/check-in').set(auth(A.managerToken)).send({ memberId: m._id })).status).toBe(400);
  });
});

describe('attendance rules', () => {
  const checkIn = (t, memberId) => request(app).post('/api/attendance/check-in').set(auth(t.managerToken)).send({ memberId });

  it('blocks an expired membership, and a member with no plan', async () => {
    const m = await newMember(A, { name: 'Expired One', phone: '9710000004' });
    await Member.updateOne({ _id: m._id }, { membershipEnd: new Date(Date.now() - 3 * day) });
    const r = await checkIn(A, m._id);
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/ended|renew/i);
    const noPlan = (await request(app).post('/api/members').set(auth(A.managerToken)).send({ name: 'No Plan', phone: '9710000005', branchId: A.branch._id.toString() })).body;
    expect((await checkIn(A, noPlan._id)).status).toBe(400);
  });
  it('blocks frozen and cancelled memberships', async () => {
    const m = await newMember(A, { name: 'Frozen One', phone: '9710000006' });
    await Member.updateOne({ _id: m._id }, { membershipStatus: 'frozen' });
    expect((await checkIn(A, m._id)).status).toBe(400);
    await Member.updateOne({ _id: m._id }, { membershipStatus: 'cancelled' });
    expect((await checkIn(A, m._id)).status).toBe(400);
  });
  it('lets a grace-period gym switch the membership check off', async () => {
    await setFlag(B.tenant, 'rules:blockExpiredCheckIn', false);
    const m = await newMember(B, { name: 'Grace Member', phone: '9710000007' });
    await Member.updateOne({ _id: m._id }, { membershipEnd: new Date(Date.now() - 2 * day) });
    expect((await checkIn(B, m._id)).status).toBe(201);
  });
  it('does not create a second open record, and allows a new visit after check-out', async () => {
    const m = await newMember(A, { name: 'Twice', phone: '9710000008' });
    const first = await checkIn(A, m._id);
    expect(first.status).toBe(201);
    const second = await checkIn(A, m._id);
    expect(second.status).toBe(409);
    expect(second.body.message).toMatch(/already checked in/i);
    expect((await request(app).post('/api/attendance/check-out').set(auth(A.managerToken)).send({ attendanceId: first.body._id })).status).toBe(200);
    expect((await checkIn(A, m._id)).status).toBe(201);
  });
  it('no longer lets a member check themselves in from anywhere', async () => {
    const { token } = await memberToken(A.managerToken, mA);
    const r = await request(app).post('/api/attendance/check-in').set(auth(token)).send({});
    expect(r.status).toBe(403);
  });
});

describe('QR pass and desk scanner (feature flag)', () => {
  let me; let meToken;
  beforeAll(async () => {
    me = await newMember(A, { name: 'Pass Holder', phone: '9710000009' });
    ({ token: meToken } = await memberToken(A.managerToken, me));
  });
  const getPass = () => request(app).get('/api/member-app/pass').set(auth(meToken));
  const scan = (t, token) => request(app).post('/api/attendance/scan').set(auth(t.managerToken)).send({ token });

  it('is off by default for every gym', async () => {
    expect(FEATURE_REGISTRY['features:qrCheckIn'].default).toBe(false);
    expect((await getPass()).status).toBe(403);
    expect((await scan(A, 'anything')).status).toBe(403);
  });

  it('checks a member in, then out, when the gym turns it on', async () => {
    await setFlag(A.tenant, 'features:qrCheckIn', true);
    const pass = await getPass();
    expect(pass.status).toBe(200);
    const inn = await scan(A, pass.body.token);
    expect(inn.status).toBe(201);
    expect(inn.body.action).toBe('checked-in');
    expect(inn.body.member.name).toBe('Pass Holder');
    const out = await scan(A, (await getPass()).body.token);
    expect(out.status).toBe(200);
    expect(out.body.action).toBe('checked-out');
  });
  it('rejects an expired pass, a forged pass and a session token', async () => {
    const stale = jwt.sign({ sub: String(me._id), purpose: 'checkin' }, process.env.JWT_SECRET, { expiresIn: -10 });
    const r1 = await scan(A, stale);
    expect(r1.status).toBe(400);
    expect(r1.body.message).toMatch(/expired/i);
    const forged = jwt.sign({ sub: String(me._id), purpose: 'checkin' }, 'not-the-secret', { expiresIn: 60 });
    expect((await scan(A, forged)).status).toBe(400);
    expect((await scan(A, meToken)).status).toBe(400); // a login token is not a pass
    expect((await scan(A, 12345)).status).toBe(400);
  });
  it("will not accept another gym's member", async () => {
    await setFlag(B.tenant, 'features:qrCheckIn', true);
    expect((await scan(B, (await getPass()).body.token)).status).toBe(404);
  });
  it('still applies the membership rules', async () => {
    const m = await newMember(A, { name: 'Lapsed Pass', phone: '9710000010' });
    await Member.updateOne({ _id: m._id }, { membershipEnd: new Date(Date.now() - 2 * day) });
    const { token } = await memberToken(A.managerToken, m);
    const pass = await request(app).get('/api/member-app/pass').set(auth(token));
    const r = await scan(A, pass.body.token);
    expect(r.status).toBe(400);
    expect(r.body.member.name).toBe('Lapsed Pass');
  });
  it('is for the front desk: a trainer cannot scan', async () => {
    const r = await request(app).post('/api/attendance/scan').set(auth(A.trainerToken)).send({ token: (await getPass()).body.token });
    expect(r.status).toBe(403);
  });
});

describe('payment history in the member app (feature flag)', () => {
  it('is off by default, then shows only the member\'s own payments', async () => {
    const { token } = await memberToken(A.managerToken, mA);
    expect(FEATURE_REGISTRY['features:memberPayments'].default).toBe(false);
    expect((await request(app).get('/api/member-app/payments').set(auth(token))).status).toBe(403);
    await setFlag(A.tenant, 'features:memberPayments', true);
    const res = await request(app).get('/api/member-app/payments').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((p) => p.invoiceNumber && p.amount >= 0)).toBe(true);
    const other = await memberToken(A.managerToken, await newMember(A, { name: 'No Payments', phone: '9710000011' }));
    expect((await request(app).get('/api/member-app/payments').set(auth(other.token))).body).toEqual([]);
  });
  it('the member login tells the app which features are on', async () => {
    const { login } = await memberToken(A.managerToken, mA);
    expect(login.features['features:memberPayments']).toBe(true);
    expect(login.features['features:qrCheckIn']).toBe(true);
    expect(login.features['features:whatsappReminders']).toBe(false);
  });
});

describe('the rules flags exist and default safely', () => {
  it('new capabilities are opt-in; the safety rule is on', () => {
    expect(FEATURE_REGISTRY['features:whatsappReminders'].default).toBe(false);
    expect(FEATURE_REGISTRY['rules:blockExpiredCheckIn']).toMatchObject({ category: 'rule', default: true });
  });
});

describe('bad input gets a 4xx, never a 500', () => {
  const get = (p) => request(app).get(p).set(auth(A.managerToken));
  it('treats search text as text', async () => {
    for (const s of ['(', '[', '(a+)+$', '\\', '.*']) {
      const r = await get(`/api/members?search=${encodeURIComponent(s)}`);
      expect(r.status).toBe(200);
    }
  });
  it('rejects query operators, junk ids and junk dates', async () => {
    for (const p of ['/api/members?search[$ne]=x', '/api/members?membershipPlanId[$ne]=1', '/api/members?expiringInDays=abc',
      '/api/members?membershipStatus[$ne]=zzz', '/api/payments?from=not-a-date', '/api/payments?memberId=notanid', '/api/payments?status[$ne]=x']) {
      const r = await get(p);
      expect([400]).toContain(r.status);
    }
    expect((await get('/api/members/notanid')).status).toBe(400);
  });
  it('caps and sanitises paging', async () => {
    for (let i = 0; i < 3; i += 1) await pay(A, { memberId: mA._id, amount: 10 + i });
    const zero = await get('/api/payments?limit=0');
    expect(zero.status).toBe(200);
    expect(zero.body.limit).toBe(20);
    expect((await get('/api/payments?limit=999999')).body.limit).toBe(200);
    expect((await get('/api/payments?limit=-1')).body.limit).toBe(20);
    expect((await get('/api/payments?page=-5')).body.page).toBe(1);
    expect((await get('/api/members?limit=abc')).status).toBe(200);
    expect((await get('/api/members?limit=100000')).body.limit).toBe(200);
  });
  it('does not leak database messages in a server error', async () => {
    const r = await get('/api/members?search=%28');
    expect(JSON.stringify(r.body)).not.toMatch(/regular expression|mongo|cast to/i);
  });
});

describe('input validation', () => {
  const post = (body) => request(app).post('/api/members').set(auth(A.managerToken)).send({ branchId: A.branch._id.toString(), ...body });
  it('rejects a bad phone, an enormous name, a future birth date and absurd start dates', async () => {
    expect((await post({ name: 'x', phone: 'not-a-phone!!' })).status).toBe(400);
    expect((await post({ name: 'x'.repeat(5000), phone: '9720000001' })).status).toBe(400);
    expect((await post({ name: 'Baby', phone: '9720000002', dob: '2099-01-01' })).status).toBe(400);
    expect((await post({ name: 'Old', phone: '9720000003', dob: '1850-01-01' })).status).toBe(400);
    expect((await post({ name: 'Past', phone: '9720000004', membershipPlanId: A.plan._id.toString(), membershipStart: '1999-01-01' })).status).toBe(400);
    expect((await post({ name: 'Future', phone: '9720000005', membershipPlanId: A.plan._id.toString(), membershipStart: '2099-01-01' })).status).toBe(400);
  });
  it('accepts normal phone formats and a start date of today', async () => {
    for (const [i, phone] of ['+91 98765 43210', '098765-43210', '(080) 2345 6789'].entries()) {
      expect((await post({ name: `Fmt ${i}`, phone })).status).toBe(201);
    }
    expect((await post({ name: 'Today', phone: '9720000006', membershipPlanId: A.plan._id.toString(), membershipStart: new Date().toISOString().slice(0, 10) })).status).toBe(201);
  });
  it('requires a real password when changing it', async () => {
    const r = await request(app).post('/api/auth/change-password').set(auth(A.trainerToken)).send({ currentPassword: 'TestPass123!', newPassword: 'a' });
    expect(r.status).toBe(400);
  });
});

describe('member email is unique within a gym, not across gyms', () => {
  it('lets two gyms enrol the same email, and each member signs in to their own gym', async () => {
    const email = 'shared.person@example.com';
    const a = await request(app).post('/api/members').set(auth(A.managerToken)).send({ name: 'Shared A', phone: '9730000001', email, branchId: A.branch._id.toString() });
    const b = await request(app).post('/api/members').set(auth(B.managerToken)).send({ name: 'Shared B', phone: '9730000002', email, branchId: B.branch._id.toString() });
    expect([a.status, b.status]).toEqual([201, 201]);
    const accA = (await request(app).post(`/api/members/${a.body._id}/app-access`).set(auth(A.managerToken))).body;
    const accB = (await request(app).post(`/api/members/${b.body._id}/app-access`).set(auth(B.managerToken))).body;
    const loginA = await request(app).post('/api/member-auth/login').send({ identifier: email, password: accA.password });
    const loginB = await request(app).post('/api/member-auth/login').send({ identifier: email, password: accB.password });
    expect(loginA.body.member.name).toBe('Shared A');
    expect(loginB.body.member.name).toBe('Shared B');
  });
  it('still refuses a duplicate inside one gym, with a clear message', async () => {
    const r = await request(app).post('/api/members').set(auth(A.managerToken)).send({ name: 'Dup', phone: '9730000003', email: 'shared.person@example.com', branchId: A.branch._id.toString() });
    expect(r.status).toBe(409);
    expect(r.body.message).toMatch(/email/i);
  });
  it('creates 25 members at once without a code collision', async () => {
    const burst = await Promise.all(Array.from({ length: 25 }, (_, i) => request(app).post('/api/members').set(auth(A.managerToken)).send({ name: `Burst ${i}`, phone: `98${String(i).padStart(8, '0')}`, branchId: A.branch._id.toString() })));
    expect(burst.filter((r) => r.status !== 201)).toEqual([]);
    expect(new Set(burst.map((r) => r.body.memberCode)).size).toBe(25);
  });
});

describe('public privacy policy', () => {
  it('loads without signing in, names the operator safely, and is not swallowed by the SPA fallback', async () => {
    process.env.PRIVACY_OPERATOR_NAME = 'Iron <b>Gym</b>';
    process.env.PRIVACY_CONTACT_EMAIL = 'privacy@iron.example';
    const res = await request(app).get('/privacy');
    delete process.env.PRIVACY_OPERATOR_NAME; delete process.env.PRIVACY_CONTACT_EMAIL;
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('Delete my account');
    expect(res.text).toContain('mailto:privacy@iron.example');
    expect(res.text).toContain('Iron &lt;b&gt;Gym&lt;/b&gt;');
    expect(res.text).not.toContain('{{');
  });
});
