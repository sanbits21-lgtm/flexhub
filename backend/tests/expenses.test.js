const { app, request, connect, disconnect, seedTenant, auth, uniq, login, PASSWORD } = require('./helpers');
const Branch = require('../models/Branch');
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const Equipment = require('../models/Equipment');
const Expense = require('../models/Expense');
const MemberPayment = require('../models/MemberPayment');
const Member = require('../models/Member');
const photos = require('./photoFixtures');

// The gym's books: expenses, payroll, and the profit against collections.

const PNG = photos.b64(photos.png(256, 256));
let t; let other; let north; let northManagerToken; let northManager;
let mainEquipment; let northEquipment;

const post = (token, url, body) => request(app).post(url).set(auth(token)).send(body);
const get = (token, url) => request(app).get(url).set(auth(token));
const today = () => new Date().toISOString().slice(0, 10);
const month = () => today().slice(0, 7);

beforeAll(async () => {
  await connect();
  t = await seedTenant('exp');
  other = await seedTenant('expother');
  north = await Branch.create({ tenantId: t.tenant._id, name: 'North' });
  northManager = await User.create({
    name: 'North manager', email: `nm-${uniq('x')}@example.com`, phone: '9000000088', password: PASSWORD,
    role: 'branch-manager', tenantId: t.tenant._id, branchId: north._id, salary: 20000,
  });
  northManagerToken = await login(northManager.email);
  await User.updateOne({ _id: t.manager._id }, { salary: 25000 });
  await User.updateOne({ _id: t.trainer._id }, { salary: 15000 });
  mainEquipment = await Equipment.create({ tenantId: t.tenant._id, branchId: t.branch._id, name: 'Main treadmill' });
  northEquipment = await Equipment.create({ tenantId: t.tenant._id, branchId: north._id, name: 'North rack' });
}, 120000);
afterAll(disconnect);

describe('recording expenses', () => {
  it('the owner records a branch cost and a whole-gym cost', async () => {
    const branchCost = await post(t.adminToken, '/api/expenses', { category: 'rent', amount: 30000, date: today(), branchId: t.branch._id.toString(), paidTo: 'Landlord', method: 'bank' });
    expect(branchCost.status).toBe(201);
    expect(branchCost.body).toMatchObject({ category: 'rent', amount: 30000, hasReceipt: false });
    const wide = await post(t.adminToken, '/api/expenses', { category: 'marketing', amount: 5000, date: today() });
    expect(wide.status).toBe(201);
    expect(wide.body.branchId).toBeNull();
  });

  it("a manager's cost is always in their own branch, whatever they send", async () => {
    const res = await post(northManagerToken, '/api/expenses', { category: 'utilities', amount: 1200, date: today(), branchId: t.branch._id.toString() });
    expect(res.status).toBe(201);
    expect(res.body.branchId).toBe(north._id.toString());
  });

  it('a manager cannot record a salary', async () => {
    const res = await post(northManagerToken, '/api/expenses', { category: 'salary-trainer', amount: 1000, date: today() });
    expect(res.status).toBe(403);
  });

  it('refuses nonsense: zero or absurd amounts, bad dates, a bad category, a branch of another gym', async () => {
    const bad = (body) => post(t.adminToken, '/api/expenses', { category: 'other', amount: 100, date: today(), ...body });
    expect((await bad({ amount: 0 })).status).toBe(400);
    expect((await bad({ amount: 99999999999 })).status).toBe(400);
    expect((await bad({ date: 'not a date' })).status).toBe(400);
    expect((await bad({ date: '1999-01-01' })).status).toBe(400);
    expect((await bad({ category: 'gold-plating' })).status).toBe(400);
    expect((await bad({ branchId: other.branch._id.toString() })).status).toBe(400);
  });

  it('trainers have no access', async () => {
    expect((await get(t.trainerToken, '/api/expenses')).status).toBe(403);
    expect((await post(t.trainerToken, '/api/expenses', { category: 'other', amount: 1, date: today() })).status).toBe(403);
  });
});

describe('who sees what', () => {
  let salaryRow;
  beforeAll(async () => {
    salaryRow = (await post(t.adminToken, '/api/expenses', { category: 'salary-other', amount: 8000, date: today(), branchId: north._id.toString(), paidTo: 'Cleaner' })).body;
  });

  it('a manager sees their branch only, and never salaries; the owner sees everything', async () => {
    const mine = (await get(northManagerToken, '/api/expenses')).body.items;
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((e) => e.branchId === north._id.toString())).toBe(true);
    expect(mine.some((e) => e.category.startsWith('salary'))).toBe(false);
    const all = (await get(t.adminToken, '/api/expenses')).body.items;
    expect(all.some((e) => e._id === salaryRow._id)).toBe(true);
    expect(all.some((e) => e.branchId === null)).toBe(true);
    expect((await get(northManagerToken, '/api/expenses?category=salary-other')).body.items).toEqual([]);
  });

  it("another gym sees none of it, and cannot touch it", async () => {
    expect((await get(other.adminToken, '/api/expenses')).body.items).toEqual([]);
    expect((await request(app).post(`/api/expenses/${salaryRow._id}/void`).set(auth(other.adminToken))).status).toBe(404);
    expect((await request(app).put(`/api/expenses/${salaryRow._id}`).set(auth(other.adminToken)).send({ amount: 1 })).status).toBe(404);
  });

  it('a manager cannot change or void a salary row, or one of another branch', async () => {
    expect((await request(app).post(`/api/expenses/${salaryRow._id}/void`).set(auth(northManagerToken))).status).toBe(404);
    const mainRow = (await post(t.adminToken, '/api/expenses', { category: 'other', amount: 10, date: today(), branchId: t.branch._id.toString() })).body;
    expect((await request(app).put(`/api/expenses/${mainRow._id}`).set(auth(northManagerToken)).send({ amount: 1 })).status).toBe(404);
  });
});

describe('correcting a mistake', () => {
  it('can edit a normal row, and voiding keeps the row but drops it from the totals', async () => {
    const row = (await post(t.adminToken, '/api/expenses', { category: 'other', amount: 777, date: today(), branchId: t.branch._id.toString() })).body;
    const edited = await request(app).put(`/api/expenses/${row._id}`).set(auth(t.adminToken)).send({ amount: 888, note: 'fixed' });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ amount: 888, note: 'fixed' });
    const before = (await get(t.adminToken, '/api/expenses/summary')).body.totalExpenses;
    const voided = await request(app).post(`/api/expenses/${row._id}/void`).set(auth(t.adminToken)).send({ reason: 'typo' });
    expect(voided.body).toMatchObject({ voided: true, voidReason: 'typo' });
    const after = (await get(t.adminToken, '/api/expenses/summary')).body.totalExpenses;
    expect(before - after).toBe(888);
    expect((await request(app).put(`/api/expenses/${row._id}`).set(auth(t.adminToken)).send({ amount: 1 })).status).toBe(400); // voided: frozen
    expect((await get(t.adminToken, '/api/expenses')).body.items.some((e) => e._id === row._id && e.voided)).toBe(true); // still on the books
  });
});

describe('receipts', () => {
  it('a photographed bill can be attached, read back, and only by those who may see the expense', async () => {
    const row = (await post(northManagerToken, '/api/expenses', { category: 'maintenance', amount: 500, date: today() })).body;
    const up = await request(app).put(`/api/expenses/${row._id}/receipt`).set(auth(northManagerToken)).send({ image: PNG });
    expect(up.status).toBe(200);
    expect((await get(northManagerToken, '/api/expenses')).body.items.find((e) => e._id === row._id).hasReceipt).toBe(true);
    const served = await get(t.adminToken, `/api/expenses/${row._id}/receipt`);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toBe('image/png');
    expect((await get(other.adminToken, `/api/expenses/${row._id}/receipt`)).status).toBe(404);
    expect((await get(t.managerToken, `/api/expenses/${row._id}/receipt`)).status).toBe(404); // the main branch manager: another branch
  });

  it('refuses something that is not a picture', async () => {
    const row = (await post(t.adminToken, '/api/expenses', { category: 'other', amount: 5, date: today() })).body;
    const res = await request(app).put(`/api/expenses/${row._id}/receipt`).set(auth(t.adminToken)).send({ image: `data:text/html;base64,${Buffer.from('<b>x</b>').toString('base64')}` });
    expect(res.status).toBe(400);
  });
});

describe('profit against collections', () => {
  it('shows what came in, what went out and the difference, by category and by month', async () => {
    const tenant = await Tenant.create({ name: 'Books gym', slug: uniq('books'), contactEmail: `${uniq('b')}@example.com`, maxBranches: 3 });
    const branch = await Branch.create({ tenantId: tenant._id, name: 'Only' });
    const owner = await User.create({ name: 'Owner', email: `${uniq('o')}@example.com`, phone: '9000000099', password: PASSWORD, role: 'tenant-admin', tenantId: tenant._id });
    const token = await login(owner.email);
    const member = await Member.create({ tenantId: tenant._id, branchId: branch._id, name: 'Payer', phone: '9111100001', memberCode: uniq('MC'), qrCode: uniq('QR'), password: 'Sup3r-secret-pass' });
    await MemberPayment.create({ tenantId: tenant._id, branchId: branch._id, memberId: member._id, amount: 10000, method: 'cash', status: 'paid', paidAt: new Date(), invoiceNumber: uniq('INV') });
    await MemberPayment.create({ tenantId: tenant._id, branchId: branch._id, memberId: member._id, amount: 999, method: 'cash', status: 'pending', invoiceNumber: uniq('INV') }); // not collected
    await post(token, '/api/expenses', { category: 'rent', amount: 4000, date: today() });
    await post(token, '/api/expenses', { category: 'utilities', amount: 1000, date: today() });
    const s = (await get(token, '/api/expenses/summary')).body;
    expect(s).toMatchObject({ collected: 10000, totalExpenses: 5000, net: 5000, partial: false });
    expect(s.byCategory).toEqual([{ category: 'rent', total: 4000 }, { category: 'utilities', total: 1000 }]);
    expect(s.monthly).toHaveLength(6);
    expect(s.monthly[5]).toMatchObject({ expenses: 5000, collected: 10000 });
  });

  it("a manager's figures leave out salaries and give no net", async () => {
    const s = (await get(northManagerToken, '/api/expenses/summary')).body;
    expect(s.net).toBeNull();
    expect(s.partial).toBe(true);
    expect(s.byCategory.some((c) => c.category.startsWith('salary'))).toBe(false);
  });
});

describe('payroll', () => {
  let payee;
  const run = (lines) => post(t.adminToken, '/api/payroll', { month: month(), lines });

  it('is for the owner only', async () => {
    expect((await get(t.managerToken, '/api/payroll')).status).toBe(403);
    expect((await get(t.trainerToken, '/api/payroll')).status).toBe(403);
    expect((await post(t.managerToken, '/api/payroll', { month: month(), lines: [{ kind: 'staff', id: t.trainer._id.toString() }] })).status).toBe(403);
    expect((await get(t.managerToken, '/api/payroll/payees')).status).toBe(403);
  });

  it('proposes everyone with a salary: trainers, managers and the people on the Payees list', async () => {
    payee = (await post(t.adminToken, '/api/payroll/payees', { name: 'Raju', roleLabel: 'Cleaner', branchId: t.branch._id.toString(), monthlySalary: 9000 })).body;
    await post(t.adminToken, '/api/payroll/payees', { name: 'No pay set', monthlySalary: 0 });
    const preview = (await get(t.adminToken, `/api/payroll?month=${month()}`)).body;
    const byName = Object.fromEntries(preview.lines.map((l) => [l.name, l]));
    expect(byName[t.trainer.name]).toMatchObject({ kind: 'staff', base: 15000, roleLabel: 'Trainer', paid: null });
    expect(byName[t.manager.name]).toMatchObject({ base: 25000, roleLabel: 'Branch manager' });
    expect(byName.Raju).toMatchObject({ kind: 'payee', base: 9000, roleLabel: 'Cleaner' });
    expect(preview.withoutSalary).toContain('No pay set');
  });

  it('pays with a bonus and a deduction, filed under the right category', async () => {
    const res = await run([
      { kind: 'staff', id: t.trainer._id.toString(), bonus: 2000, deduction: 500 },
      { kind: 'staff', id: t.manager._id.toString() },
      { kind: 'payee', id: payee._id.toString(), method: 'cash' },
    ]);
    expect(res.status).toBe(201);
    expect(res.body.results.every((r) => r.ok)).toBe(true);
    expect(res.body.results.find((r) => r.key === `staff:${t.trainer._id}`).amount).toBe(16500);
    const rows = await Expense.find({ tenantId: t.tenant._id, payrollMonth: month(), voided: false });
    expect(Object.fromEntries(rows.map((r) => [r.category, r.amount]))).toMatchObject({ 'salary-trainer': 16500, 'salary-manager': 25000, 'salary-other': 9000 });
    expect(rows.find((r) => r.category === 'salary-trainer')).toMatchObject({ base: 15000, bonus: 2000, deduction: 500, paidTo: t.trainer.name });
  });

  it('never pays the same person twice for a month, and shows them as paid', async () => {
    const again = await run([{ kind: 'staff', id: t.trainer._id.toString() }]);
    expect(again.status).toBe(200);
    expect(again.body.results[0]).toMatchObject({ ok: false, error: `Already paid for ${month()}` });
    const preview = (await get(t.adminToken, `/api/payroll?month=${month()}`)).body;
    expect(preview.lines.find((l) => l.name === t.trainer.name).paid).toMatchObject({ amount: 16500 });
  });

  it('a voided payroll row frees the person to be paid again; a payroll row cannot be edited', async () => {
    const row = await Expense.findOne({ tenantId: t.tenant._id, payrollKey: `${month()}:payee:${payee._id}`, voided: false });
    expect((await request(app).put(`/api/expenses/${row._id}`).set(auth(t.adminToken)).send({ amount: 1 })).status).toBe(400);
    expect((await request(app).post(`/api/expenses/${row._id}/void`).set(auth(t.adminToken))).status).toBe(200);
    const redo = await run([{ kind: 'payee', id: payee._id.toString(), deduction: 1000 }]);
    expect(redo.body.results[0]).toMatchObject({ ok: true, amount: 8000 });
  });

  it('refuses a deduction that leaves nothing, and people of another gym', async () => {
    const res = await run([{ kind: 'payee', id: payee._id.toString() }, { kind: 'staff', id: other.trainer._id.toString() }]);
    expect(res.body.results.find((r) => r.key === `staff:${other.trainer._id}`)).toMatchObject({ ok: false, error: 'Person not found' });
    const month2 = '2030-01';
    const zero = await post(t.adminToken, '/api/payroll', { month: month2, lines: [{ kind: 'payee', id: payee._id.toString(), deduction: 9000 }] });
    expect(zero.body.results[0]).toMatchObject({ ok: false, error: 'Nothing to pay after the deduction' });
    expect((await post(t.adminToken, '/api/payroll', { month: 'November', lines: [{ kind: 'payee', id: payee._id.toString() }] })).status).toBe(400);
  });

  it('keeps the Payees list per gym, and removing a person stops them appearing', async () => {
    const mine = (await get(t.adminToken, '/api/payroll/payees')).body.map((p) => p.name);
    expect(mine).toContain('Raju');
    expect((await get(other.adminToken, '/api/payroll/payees')).body.map((p) => p.name)).not.toContain('Raju');
    expect((await request(app).delete(`/api/payroll/payees/${payee._id}`).set(auth(other.adminToken))).status).toBe(404);
    expect((await post(t.adminToken, '/api/payroll/payees', { name: 'Foreign', branchId: other.branch._id.toString(), monthlySalary: 1 })).status).toBe(400);
    expect((await request(app).delete(`/api/payroll/payees/${payee._id}`).set(auth(t.adminToken))).status).toBe(200);
    expect((await get(t.adminToken, '/api/payroll/payees')).body.map((p) => p.name)).not.toContain('Raju');
  });
});

describe('logging a service on equipment', () => {
  it('records the visit, moves the due date, and books the cost as maintenance for that branch', async () => {
    const res = await post(northManagerToken, `/api/equipment/${northEquipment._id}/service`, { cost: 2500, vendor: 'FixIt Co', nextServiceDue: '2031-01-01' });
    expect(res.status).toBe(200);
    expect(res.body.equipment.lastServicedAt).toBeTruthy();
    expect(new Date(res.body.equipment.nextServiceDue).getFullYear()).toBe(2031);
    expect(res.body.expense).toMatchObject({ category: 'maintenance', amount: 2500, paidTo: 'FixIt Co', branchId: north._id.toString(), equipmentId: northEquipment._id.toString() });
  });

  it('with no cost, still records the visit but books nothing', async () => {
    const before = await Expense.countDocuments({ tenantId: t.tenant._id });
    const res = await post(t.adminToken, `/api/equipment/${mainEquipment._id}/service`, {});
    expect(res.status).toBe(200);
    expect(res.body.expense).toBeNull();
    expect(await Expense.countDocuments({ tenantId: t.tenant._id })).toBe(before);
  });

  it("a manager cannot service another branch's or another gym's equipment", async () => {
    expect((await post(northManagerToken, `/api/equipment/${mainEquipment._id}/service`, { cost: 1 })).status).toBe(404);
    expect((await post(t.adminToken, `/api/equipment/${(await Equipment.create({ tenantId: other.tenant._id, branchId: other.branch._id, name: 'Theirs' }))._id}/service`, { cost: 1 })).status).toBe(404);
  });

  it('an expense tied to equipment takes that equipment\'s branch, and equipment of another gym is refused', async () => {
    const row = await post(t.adminToken, '/api/expenses', { category: 'maintenance', amount: 300, date: today(), equipmentId: northEquipment._id.toString(), branchId: t.branch._id.toString() });
    expect(row.status).toBe(201);
    expect(row.body.branchId).toBe(north._id.toString());
    const foreign = await Equipment.create({ tenantId: other.tenant._id, branchId: other.branch._id, name: 'Foreign' });
    expect((await post(t.adminToken, '/api/expenses', { category: 'maintenance', amount: 1, date: today(), equipmentId: foreign._id.toString() })).status).toBe(400);
  });
});

describe('the data layer', () => {
  it('refuses an expense that points at another gym\'s branch, staff, payee or equipment, whatever route saved it', async () => {
    const base = { tenantId: t.tenant._id, category: 'other', amount: 1, date: new Date() };
    await expect(Expense.create({ ...base, branchId: other.branch._id })).rejects.toThrow(/does not belong to this gym/);
    await expect(Expense.create({ ...base, staffId: other.trainer._id })).rejects.toThrow(/does not belong to this gym/);
    await expect(Expense.create({ ...base, equipmentId: (await Equipment.create({ tenantId: other.tenant._id, branchId: other.branch._id, name: 'X' }))._id })).rejects.toThrow(/does not belong to this gym/);
  });
});

describe('switching it off', () => {
  it('a gym without the feature gets nothing, and equipment service still works without a ledger', async () => {
    await Tenant.updateOne({ _id: other.tenant._id }, { $set: { 'features.pages:expenses': false } });
    expect((await get(other.adminToken, '/api/expenses')).status).toBe(403);
    expect((await get(other.adminToken, '/api/payroll')).status).toBe(403);
    const eq = await Equipment.create({ tenantId: other.tenant._id, branchId: other.branch._id, name: 'Offline' });
    const res = await post(other.adminToken, `/api/equipment/${eq._id}/service`, { cost: 100 });
    expect(res.status).toBe(200);
    expect(res.body.expense).toBeNull();
  });
});
