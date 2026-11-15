const { app, request, connect, disconnect, seedTenant, createMember, login, auth, uniq, PASSWORD } = require('./helpers');
const Branch = require('../models/Branch');
const User = require('../models/User');
const MembershipPlan = require('../models/MembershipPlan');
const migrations = require('../utils/migrations');

// A plan can be offered at several branches, set from the plan or from the branch.

let t; let other;
let main; let north; let south;
let northManagerToken;

const plan = (body) => request(app).post('/api/membership-plans').set(auth(t.adminToken)).send({ durationUnit: 'monthly', price: 500, ...body });
const idsOf = async (id) => (await MembershipPlan.findById(id)).branchIds.map(String).sort();
const sorted = (...ids) => ids.map(String).sort();
// What the branch form sends: the whole checklist, i.e. every active plan the branch offers now, with changes applied.
const offered = async (branch, { add = [], remove = [] } = {}) => {
  const plans = await MembershipPlan.find({ tenantId: t.tenant._id, isActive: true });
  const ids = plans.filter((p) => !(p.branchIds || []).length || p.branchIds.some((b) => String(b) === String(branch._id))).map((p) => String(p._id));
  return [...new Set([...ids, ...add.map(String)])].filter((id) => !remove.map(String).includes(id));
};

beforeAll(async () => {
  await connect();
  t = await seedTenant('pb');
  other = await seedTenant('pbother');
  main = t.branch;
  north = await Branch.create({ tenantId: t.tenant._id, name: 'North' });
  south = await Branch.create({ tenantId: t.tenant._id, name: 'South' });
  const manager = await User.create({
    name: 'North manager', email: `nm-${uniq('x')}@example.com`, phone: '9000000077', password: PASSWORD,
    role: 'branch-manager', tenantId: t.tenant._id, branchId: north._id,
  });
  northManagerToken = await login(manager.email);
}, 120000);
afterAll(disconnect);

describe('one plan, several branches', () => {
  it('can be created for a chosen set of branches, and is usable at exactly those', async () => {
    const res = await plan({ name: 'Main and North', branchIds: [main._id.toString(), north._id.toString()] });
    expect(res.status).toBe(201);
    expect(res.body.branchIds.map(String).sort()).toEqual(sorted(main._id, north._id));

    const at = (branch) => createMember(t.adminToken, { branchId: branch._id.toString(), planId: res.body._id, name: `M ${branch.name}`, phone: `97${Math.floor(Math.random() * 1e8)}` });
    expect((await at(main)).membershipPlanId).toBe(res.body._id);
    expect((await at(north)).membershipPlanId).toBe(res.body._id);
    await expect(at(south)).rejects.toThrow(/different branch/);
  });

  it("is listed for a branch manager of one of its branches, and not for another's", async () => {
    const res = await plan({ name: 'Only South', branchIds: [south._id.toString()] });
    const forNorth = await request(app).get('/api/membership-plans').set(auth(northManagerToken));
    const names = (forNorth.body.data || forNorth.body.plans || forNorth.body).map((p) => p.name);
    expect(names).toContain('Main and North');
    expect(names).not.toContain('Only South');
    expect(res.status).toBe(201);
  });

  it('still reads the older single branchId, and an empty list means every branch', async () => {
    const one = await plan({ name: 'Legacy one', branchId: north._id.toString() });
    expect(one.body.branchIds.map(String)).toEqual([north._id.toString()]);
    const all = await plan({ name: 'Everywhere', branchIds: [] });
    expect(all.body.branchIds).toEqual([]);
  });

  it('keeps its branches when edited without mentioning them', async () => {
    const created = await plan({ name: 'Keep me', branchIds: [north._id.toString(), south._id.toString()] });
    const res = await request(app).put(`/api/membership-plans/${created.body._id}`).set(auth(t.adminToken)).send({ name: 'Kept', price: 600 });
    expect(res.status).toBe(200);
    expect(await idsOf(created.body._id)).toEqual(sorted(north._id, south._id));
  });

  it("refuses another gym's branch", async () => {
    const res = await plan({ name: 'Smuggled', branchIds: [other.branch._id.toString()] });
    expect(res.status).toBe(400);
    expect((await plan({ name: 'Smuggled 2', branchIds: [main._id.toString(), other.branch._id.toString()] })).status).toBe(400);
    expect((await plan({ name: 'Bad ids', branchIds: ['nope'] })).status).toBe(400);
  });

  it('the data layer refuses a list that includes another gym\'s branch, whatever route saved it', async () => {
    await expect(MembershipPlan.create({ tenantId: t.tenant._id, name: 'X', durationUnit: 'monthly', price: 1, branchIds: [main._id, other.branch._id] })).rejects.toThrow(/does not belong to this gym/);
  });
});

describe('choosing plans from the branch form', () => {
  let everywhere; let limited;
  beforeAll(async () => {
    everywhere = (await plan({ name: 'Form everywhere' })).body;
    limited = (await plan({ name: 'Form limited', branchIds: [main._id.toString()] })).body;
  });
  const putBranch = (id, body) => request(app).put(`/api/branches/${id}`).set(auth(t.adminToken)).send(body);

  it('adds a branch to a limited plan', async () => {
    const res = await putBranch(north._id, { planIds: await offered(north, { add: [limited._id] }) });
    expect(res.status).toBe(200);
    expect(await idsOf(limited._id)).toEqual(sorted(main._id, north._id));
    expect(await idsOf(everywhere._id)).toEqual([]); // still everywhere
  });

  it('switching off a plan that is offered everywhere makes it "every other branch"', async () => {
    const res = await putBranch(south._id, { planIds: await offered(south, { remove: [everywhere._id] }) });
    expect(res.status).toBe(200);
    const ids = await idsOf(everywhere._id);
    expect(ids).toEqual(sorted(main._id, north._id));
    expect(ids).not.toContain(String(south._id));
  });

  it('removes a branch from a limited plan, but never leaves a plan with no branch', async () => {
    const ok = await putBranch(north._id, { planIds: await offered(north, { remove: [limited._id] }) });
    expect(ok.status).toBe(200);
    expect(await idsOf(limited._id)).toEqual(sorted(main._id));
    const refused = await putBranch(main._id, { planIds: await offered(main, { remove: [limited._id] }) });
    expect(refused.status).toBe(400);
    expect(refused.body.message).toMatch(/Form limited/);
    expect(await idsOf(limited._id)).toEqual(sorted(main._id)); // unchanged
  });

  it('a new branch can be created with its plans chosen in one go', async () => {
    const res = await request(app).post('/api/branches').set(auth(t.adminToken)).send({ name: 'East', planIds: [limited._id] });
    expect(res.status).toBe(201);
    expect(await idsOf(limited._id)).toEqual(sorted(main._id, res.body._id));
    // everywhere was every other branch; East was left out of it
    expect(await idsOf(everywhere._id)).not.toContain(String(res.body._id));
  });

  it("refuses another gym's plan, and a malformed list", async () => {
    const theirs = (await request(app).post('/api/membership-plans').set(auth(other.adminToken)).send({ name: 'Theirs', durationUnit: 'monthly', price: 1 })).body;
    expect((await putBranch(north._id, { planIds: [theirs._id] })).status).toBe(400);
    expect((await putBranch(north._id, { planIds: 'nope' })).status).toBe(400);
    expect((await MembershipPlan.findById(theirs._id)).branchIds).toEqual([]);
  });

  it('a request that does not mention plans leaves them alone', async () => {
    const before = await idsOf(limited._id);
    expect((await putBranch(north._id, { phone: '9000000099' })).status).toBe(200);
    expect(await idsOf(limited._id)).toEqual(before);
  });
});

describe('plans saved before the list existed', () => {
  it('are migrated: one branch becomes a one-item list, none becomes every branch', async () => {
    const raw = MembershipPlan.collection;
    const a = await raw.insertOne({ tenantId: t.tenant._id, name: 'Old one', durationUnit: 'monthly', price: 1, branchId: north._id, isActive: true });
    const b = await raw.insertOne({ tenantId: t.tenant._id, name: 'Old all', durationUnit: 'monthly', price: 1, branchId: null, isActive: true });
    await migrations.run();
    const one = await raw.findOne({ _id: a.insertedId });
    const all = await raw.findOne({ _id: b.insertedId });
    expect(one.branchIds.map(String)).toEqual([north._id.toString()]);
    expect(one.branchId).toBeUndefined();
    expect(all.branchIds).toEqual([]);
    expect(all.branchId).toBeUndefined();
  });
});
