const { app, request, connect, disconnect, login, PASSWORD, uniq, auth } = require('./helpers');
const User = require('../models/User');
const Tenant = require('../models/Tenant');

let superAdmin;

beforeAll(async () => {
  await connect();
  const email = `${uniq('super')}@example.com`;
  const su = await User.create({ name: 'Super', email, phone: '9000000000', password: PASSWORD, role: 'super-admin' });
  superAdmin = { user: su, token: await login(email) };
}, 60000);
afterAll(disconnect);

const createTenantPayload = (label) => {
  const slug = uniq(label);
  return {
    name: `${label} Gym`, slug, contactEmail: `${slug}@example.com`, maxBranches: 1,
    admin: { name: `${label} admin`, email: `admin-${slug}@example.com`, phone: '9000000099', password: PASSWORD },
  };
};

describe('unscoped platform-admin visibility (regression)', () => {
  it('does not lose visibility into existing tenants after creating its first tenant', async () => {
    // A pre-existing tenant, created by someone else entirely, that this platform-admin
    // never touches directly.
    const other = await Tenant.create({ name: 'Preexisting Gym', slug: uniq('preexisting'), contactEmail: `${uniq('pre')}@example.com` });

    const paEmail = `${uniq('pa')}@example.com`;
    await User.create({ name: 'Fresh PA', email: paEmail, phone: '9000000098', password: PASSWORD, role: 'platform-admin' });
    const paToken = await login(paEmail);

    // Unscoped (empty managedTenantIds) — must see every tenant, including ones it
    // didn't create.
    const before = await request(app).get('/api/tenants').set(auth(paToken));
    expect(before.body.some((t) => t._id === other._id.toString())).toBe(true);
    const countBefore = before.body.length;

    // Creating its own first tenant must NOT narrow its scope.
    const created = await request(app).post('/api/tenants').set(auth(paToken)).send(createTenantPayload('First'));
    expect(created.status).toBe(201);

    const after = await request(app).get('/api/tenants').set(auth(paToken));
    expect(after.body.some((t) => t._id === other._id.toString())).toBe(true); // still visible
    expect(after.body.length).toBe(countBefore + 1); // grew, didn't collapse to 1
  });

  it('an already-scoped platform-admin still gains visibility into a tenant it creates', async () => {
    const scopedTenant = await Tenant.create({ name: 'Scoped Seed Gym', slug: uniq('scoped-seed'), contactEmail: `${uniq('seed')}@example.com` });
    const paEmail = `${uniq('pa-scoped')}@example.com`;
    await User.create({
      name: 'Scoped PA', email: paEmail, phone: '9000000097', password: PASSWORD, role: 'platform-admin',
      managedTenantIds: [scopedTenant._id],
    });
    const paToken = await login(paEmail);

    const before = await request(app).get('/api/tenants').set(auth(paToken));
    expect(before.body.map((t) => t._id)).toEqual([scopedTenant._id.toString()]);

    const created = await request(app).post('/api/tenants').set(auth(paToken)).send(createTenantPayload('Second'));
    expect(created.status).toBe(201);

    const after = await request(app).get('/api/tenants').set(auth(paToken));
    const ids = after.body.map((t) => t._id);
    expect(ids).toContain(scopedTenant._id.toString());
    expect(ids).toContain(created.body.tenant._id);
    expect(ids).toHaveLength(2);
  });

  it('audit-logs a scoped platform-admin action instead of silently failing the write', async () => {
    // Regression: req.scope.tenantId is {$in: [...]} for a scoped platform-admin, which
    // used to be passed straight to AuditLog.create and fail its schema cast silently —
    // every action by such an admin went completely unlogged.
    const scopedTenant = await Tenant.create({ name: 'Audit Seed Gym', slug: uniq('audit-seed'), contactEmail: `${uniq('auditseed')}@example.com` });
    const paEmail = `${uniq('pa-audit')}@example.com`;
    const paUser = await User.create({
      name: 'Audit PA', email: paEmail, phone: '9000000096', password: PASSWORD, role: 'platform-admin',
      managedTenantIds: [scopedTenant._id],
    });
    const paToken = await login(paEmail);

    const suspendRes = await request(app).patch(`/api/tenants/${scopedTenant._id}/suspend`).set(auth(paToken));
    expect(suspendRes.status).toBe(200);

    const logs = await request(app).get('/api/audit-logs?limit=10').set(auth(superAdmin.token));
    const entry = logs.body.logs.find((l) => l.action === 'SUSPEND_TENANT' && l.actorId === paUser._id.toString());
    expect(entry).toBeTruthy();
    expect(entry.tenantId).toBe(scopedTenant._id.toString());
  });
});
