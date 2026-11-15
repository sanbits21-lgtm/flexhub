const Expense = require('../models/Expense');
const Payee = require('../models/Payee');
const User = require('../models/User');
const Branch = require('../models/Branch');
const q = require('../utils/query');
const { logAudit } = require('../utils/audit');

// Monthly pay for trainers and branch managers (from the salary on their account) and for other staff (the Payees list).
// Owner only: salaries are not something a branch manager sees.

const monthNow = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const readMonth = (value) => {
  const m = q.str(value, 'month', 7) || monthNow();
  if (!MONTH.test(m)) throw new q.BadRequest('month must look like 2026-11');
  return m;
};
const CATEGORY_FOR_ROLE = { trainer: 'salary-trainer', 'branch-manager': 'salary-manager' };
const LABEL_FOR_ROLE = { trainer: 'Trainer', 'branch-manager': 'Branch manager' };

// ---- the payroll run -------------------------------------------------------------------------------------------

exports.preview = async (req, res) => {
  const month = readMonth(req.query.month);
  const tenantId = req.scope.tenantId;
  const [staff, payees, paid] = await Promise.all([
    User.find({ tenantId, role: { $in: ['trainer', 'branch-manager'] }, isActive: { $ne: false } }).select('name role salary branchId').lean(),
    Payee.find({ tenantId, isActive: true }).lean(),
    Expense.find({ tenantId, payrollMonth: month, voided: false }).select('payrollKey amount date').lean(),
  ]);
  const paidBy = new Map(paid.map((p) => [p.payrollKey, p]));
  const line = (kind, id, name, roleLabel, branchId, base) => {
    const key = `${month}:${kind}:${id}`;
    const p = paidBy.get(key);
    return { key: `${kind}:${id}`, kind, id, name, roleLabel, branchId: branchId || null, base: base || 0, paid: p ? { amount: p.amount, date: p.date } : null };
  };
  const lines = [
    ...staff.filter((u) => u.salary > 0).map((u) => line('staff', u._id, u.name, LABEL_FOR_ROLE[u.role], u.branchId, u.salary)),
    ...payees.filter((p) => p.monthlySalary > 0).map((p) => line('payee', p._id, p.name, p.roleLabel || 'Staff', p.branchId, p.monthlySalary)),
  ];
  res.json({
    month,
    lines,
    // Active people with no salary set: they cannot be paid from here until one is entered.
    withoutSalary: [...staff.filter((u) => !(u.salary > 0)).map((u) => u.name), ...payees.filter((p) => !(p.monthlySalary > 0)).map((p) => p.name)],
  });
};

exports.run = async (req, res) => {
  const { month, lines } = req.body;
  const tenantId = req.scope.tenantId;
  const results = [];
  for (const l of lines) {
    const key = `${l.kind}:${l.id}`;
    try {
      let person; let category; let base; let staffId = null; let payeeId = null; let branchId = null; let name;
      if (l.kind === 'staff') {
        person = await User.findOne({ _id: l.id, tenantId, role: { $in: ['trainer', 'branch-manager'] } }).select('name role salary branchId');
        if (!person) throw new Error('Person not found');
        ({ name, branchId } = person); base = person.salary; category = CATEGORY_FOR_ROLE[person.role]; staffId = person._id;
      } else {
        person = await Payee.findOne({ _id: l.id, tenantId });
        if (!person) throw new Error('Person not found');
        ({ name, branchId } = person); base = person.monthlySalary; category = 'salary-other'; payeeId = person._id;
      }
      if (!(base > 0)) throw new Error('No salary is set for this person');
      const bonus = Number(l.bonus) || 0;
      const deduction = Number(l.deduction) || 0;
      const amount = base + bonus - deduction;
      if (!(amount > 0)) throw new Error('Nothing to pay after the deduction');
      const date = l.date ? new Date(l.date) : new Date();
      if (Number.isNaN(date.getTime())) throw new Error('The date is not valid');
      const expense = await Expense.create({
        tenantId, branchId, category, amount, date, paidTo: name, staffId, payeeId, method: l.method || 'bank', note: l.note || undefined,
        payrollMonth: month, payrollKey: `${month}:${key}`, base, bonus, deduction, createdBy: req.user._id,
      });
      results.push({ key, ok: true, expenseId: expense._id, amount });
    } catch (err) {
      results.push({ key, ok: false, error: err.code === 11000 ? `Already paid for ${month}` : err.message });
    }
  }
  const created = results.filter((r) => r.ok).length;
  if (created) logAudit(req, 'RUN_PAYROLL', { type: 'Expense', metadata: { month, paid: created } });
  res.status(created ? 201 : 200).json({ month, results });
};

// ---- other staff (people with no login) ------------------------------------------------------------------------

const checkBranch = async (req, branchId) => {
  if (!branchId) return true;
  return !!(await Branch.exists({ _id: branchId, tenantId: req.scope.tenantId }));
};

exports.listPayees = async (req, res) => {
  const f = { tenantId: req.scope.tenantId };
  if (req.query.all !== '1') f.isActive = true;
  res.json(await Payee.find(f).sort({ name: 1 }));
};

exports.createPayee = async (req, res) => {
  const b = req.body;
  if (!(await checkBranch(req, b.branchId))) return res.status(400).json({ message: 'Branch not found for this tenant' });
  const payee = await Payee.create({ tenantId: req.scope.tenantId, name: b.name, roleLabel: b.roleLabel || undefined, branchId: b.branchId || null, monthlySalary: b.monthlySalary || 0 });
  logAudit(req, 'CREATE_PAYEE', { type: 'Payee', id: payee._id });
  res.status(201).json(payee);
};

exports.updatePayee = async (req, res) => {
  const b = req.body;
  if (!(await checkBranch(req, b.branchId))) return res.status(400).json({ message: 'Branch not found for this tenant' });
  const changes = { name: b.name, roleLabel: b.roleLabel || undefined };
  if (b.branchId !== undefined) changes.branchId = b.branchId || null;
  if (b.monthlySalary !== undefined) changes.monthlySalary = b.monthlySalary;
  if (b.isActive !== undefined) changes.isActive = b.isActive;
  const payee = await Payee.findOneAndUpdate({ _id: req.params.id, tenantId: req.scope.tenantId }, changes, { new: true, runValidators: true });
  if (!payee) return res.status(404).json({ message: 'Person not found' });
  logAudit(req, 'UPDATE_PAYEE', { type: 'Payee', id: payee._id });
  res.json(payee);
};

exports.removePayee = async (req, res) => {
  const payee = await Payee.findOneAndUpdate({ _id: req.params.id, tenantId: req.scope.tenantId }, { isActive: false }, { new: true });
  if (!payee) return res.status(404).json({ message: 'Person not found' });
  logAudit(req, 'DEACTIVATE_PAYEE', { type: 'Payee', id: payee._id });
  res.json({ message: 'Person removed from payroll' });
};
