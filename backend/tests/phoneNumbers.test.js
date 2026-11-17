const { app, request, connect, disconnect, seedTenant, createSuperAdmin, auth, uniq } = require('./helpers');
const { isValidPhone } = require('../utils/phoneNumber');

let t; let su;
beforeAll(async () => { await connect(); t = await seedTenant('ph'); su = await createSuperAdmin(); }, 120000);
afterAll(disconnect);

const BAD = ['9', '98765', '987654321', '9'.repeat(16), '98765abcde', 'not-a-phone!!', '++919876543210'];
const GOOD = ['9876543210', '+91 98765 43210', '(080) 2345 6789'];

describe('the rule itself', () => {
  it('accepts 10 to 15 digits in the usual formats and nothing else', () => {
    GOOD.forEach((p) => expect(isValidPhone(p)).toBe(true));
    BAD.forEach((p) => expect(isValidPhone(p)).toBe(false));
    expect(isValidPhone('')).toBe(false);
    expect(isValidPhone(undefined)).toBe(false);
  });
});

describe('every place a phone is typed refuses a bad one', () => {
  const member = (phone, extra = {}) => request(app).post('/api/members').set(auth(t.managerToken)).send({ name: 'Ph', phone, branchId: t.branch._id.toString(), ...extra });

  it('adding and editing a member', async () => {
    for (const p of BAD) expect((await member(p)).status).toBe(400);
    const ok = await member('+91 98765 43210');
    expect(ok.status).toBe(201);
    expect((await request(app).put(`/api/members/${ok.body._id}`).set(auth(t.managerToken)).send({ phone: '12345' })).status).toBe(400);
    expect((await request(app).put(`/api/members/${ok.body._id}`).set(auth(t.managerToken)).send({ phone: '9876543211' })).status).toBe(200);
  });

  it('a member\'s emergency contact may be empty but not nonsense', async () => {
    expect((await member('9876500001', { emergencyContact: { name: 'Mum', phone: '12' } })).status).toBe(400);
    expect((await member('9876500002', { emergencyContact: { name: 'Mum', phone: '' } })).status).toBe(201);
    expect((await member('9876500003', { emergencyContact: { name: 'Mum', phone: '9876500099' } })).status).toBe(201);
  });

  it('a bulk import marks a bad row as failed and still imports the good ones', async () => {
    const res = await request(app).post('/api/members/bulk').set(auth(t.managerToken)).send({
      branchId: t.branch._id.toString(),
      members: [{ name: 'Good Row', phone: '9876500010' }, { name: 'Short Row', phone: '98765' }, { name: 'Long Row', phone: '9'.repeat(20) }],
    });
    expect(res.status).toBeLessThan(300);
    const text = JSON.stringify(res.body);
    expect(text).toMatch(/10 to 15 digits/);
    expect(res.body.succeeded).toBe(1);
    expect(res.body.failed).toBe(2);
  });

  it('adding a trainer, a branch and a manager', async () => {
    const trainer = (phone) => request(app).post('/api/staff').set(auth(t.adminToken)).send({ name: 'T', email: `${uniq('t')}@example.com`, phone, password: 'Orchid-Lantern-47!', branchId: t.branch._id.toString() });
    expect((await trainer('123')).status).toBe(400);
    expect((await request(app).post('/api/branches').set(auth(t.adminToken)).send({ name: 'Phone Branch', phone: '123' })).status).toBe(400);
    expect((await request(app).post(`/api/branches/${t.branch._id}/managers`).set(auth(t.adminToken)).send({ name: 'M', email: `${uniq('m')}@example.com`, phone: '123', password: 'Orchid-Lantern-47!' })).status).toBe(400);
    const okBranch = await request(app).post('/api/branches').set(auth(t.adminToken)).send({ name: 'Phone Branch 2', phone: '' });
    expect([201, 403]).toContain(okBranch.status); // 403 only if the gym is at its branch limit
  });

  it('a gym\'s contact phone and a new platform admin', async () => {
    const tenant = (contactPhone) => request(app).put(`/api/tenants/${t.tenant._id}`).set(auth(su.token))
      .send({ name: 'Ph Gym', contactEmail: t.tenant.contactEmail, contactPhone, billingPlan: 'basic', billingStatus: 'active', maxBranches: 5, isActive: true });
    expect((await tenant('12345')).status).toBe(400);
    expect((await tenant('')).status).toBe(200);
    expect((await tenant('9876543210')).status).toBe(200);
    const admin = (phone) => request(app).post('/api/platform-admins').set(auth(su.token)).send({ name: 'PA', email: `${uniq('pa')}@example.com`, phone, password: 'Orchid-Lantern-47!' });
    expect((await admin('123')).status).toBe(400);
  });
});
