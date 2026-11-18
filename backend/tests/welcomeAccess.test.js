const { app, request, connect, disconnect, seedTenant, auth } = require('./helpers');
const Member = require('../models/Member');

let t;
beforeAll(async () => { await connect(); t = await seedTenant('wel'); }, 120000);
afterAll(disconnect);

const add = (body) => request(app).post('/api/members').set(auth(t.managerToken)).send({ name: 'Welcome Person', branchId: t.branch._id.toString(), ...body });

describe('a new member gets sign-in details for the welcome card', () => {
  it('returns a random password once, and it signs the member in with their member code', async () => {
    const res = await add({ phone: '9876511111' });
    expect(res.status).toBe(201);
    const { appAccess } = res.body;
    expect(appAccess).toMatchObject({ memberCode: res.body.memberCode });
    expect(appAccess.password).toMatch(/^[a-zA-Z0-9]{10}$/);
    expect(JSON.stringify(res.body)).not.toMatch(/"password":"\$2/); // never the stored hash

    const login = await request(app).post('/api/member-auth/login').send({ identifier: appAccess.memberCode, password: appAccess.password });
    expect(login.status).toBe(200);
    const bad = await request(app).post('/api/member-auth/login').send({ identifier: appAccess.memberCode, password: 'wrong-password-1' });
    expect(bad.status).toBeGreaterThanOrEqual(400);
  });

  it('every member gets a different password, and it is not kept in the clear', async () => {
    const a = (await add({ phone: '9876511112' })).body;
    const b = (await add({ phone: '9876511113' })).body;
    expect(a.appAccess.password).not.toBe(b.appAccess.password);
    const stored = await Member.findById(a._id).select('+password').lean();
    expect(stored.password).not.toBe(a.appAccess.password);
    const list = await request(app).get('/api/members').set(auth(t.managerToken));
    expect(JSON.stringify(list.body)).not.toContain(a.appAccess.password);
  });

  it('includes the email when the member has one', async () => {
    const res = await add({ phone: '9876511114', email: `welcome-${Date.now()}@example.com` });
    expect(res.body.appAccess.email).toBe(res.body.email);
  });

  it('a password chosen by staff is not echoed back', async () => {
    const res = await add({ phone: '9876511115', password: 'Orchid-Lantern-47!' });
    expect(res.status).toBe(201);
    expect(res.body.appAccess).toBeUndefined();
  });
});
