const mongoose = require('mongoose');
const Expense = require('../models/Expense');
const Branch = require('../models/Branch');
const Equipment = require('../models/Equipment');
const MemberPayment = require('../models/MemberPayment');
const q = require('../utils/query');
const { logAudit } = require('../utils/audit');
const { checkPhoto, storePhoto, removePhotoFile, sendPhoto } = require('../utils/photos');

const { SALARY_CATEGORIES } = Expense;
const RECEIPT_FOLDER = 'expense-receipts';
const isAdmin = (req) => req.user.role === 'tenant-admin';
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const dayEnd = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

// What this person may see. The owner sees everything (a branch only when drilling into one); a branch manager sees
// their own branch, and never salaries.
const visible = (req) => {
  const f = { tenantId: req.scope.tenantId };
  if (req.scope.branchId) f.branchId = req.scope.branchId;
  if (!isAdmin(req)) f.category = { $nin: SALARY_CATEGORIES };
  return f;
};

const present = (e) => {
  const o = e.toObject ? e.toObject() : e;
  const { receiptFile, ...rest } = o;
  return { ...rest, hasReceipt: !!receiptFile };
};

const readDate = (value) => {
  const d = new Date(value);
  const now = Date.now();
  if (Number.isNaN(d.getTime()) || d.getTime() < now - 2 * 366 * 86400000 || d.getTime() > now + 31 * 86400000) return null;
  return d;
};

exports.list = async (req, res) => {
  const f = visible(req);
  const from = q.date(req.query.from, 'from');
  const to = q.date(req.query.to, 'to');
  if (from || to) f.date = { ...(from && { $gte: from }), ...(to && { $lte: dayEnd(to) }) };
  const category = q.oneOf(req.query.category, Expense.CATEGORIES, 'category');
  if (category) {
    if (!isAdmin(req) && SALARY_CATEGORIES.includes(category)) return res.json({ items: [], truncated: false });
    f.category = category;
  }
  const LIMIT = 500;
  const rows = await Expense.find(f).sort({ date: -1, createdAt: -1 }).limit(LIMIT + 1).lean();
  res.json({ items: rows.slice(0, LIMIT).map(present), truncated: rows.length > LIMIT });
};

exports.create = async (req, res) => {
  const b = req.body;
  const admin = isAdmin(req);
  if (!admin && SALARY_CATEGORIES.includes(b.category)) return res.status(403).json({ message: 'Only the gym owner records salaries.' });
  const date = readDate(b.date);
  if (!date) return res.status(400).json({ message: 'The date is not valid (use a date within the last two years, up to a month ahead).' });

  let branchId = admin ? (b.branchId || null) : req.scope.branchId;
  if (b.equipmentId) {
    const equipment = await Equipment.findOne({ _id: b.equipmentId, tenantId: req.scope.tenantId, ...(admin ? {} : { branchId: req.scope.branchId }) });
    if (!equipment) return res.status(400).json({ message: 'Equipment not found' });
    branchId = equipment.branchId; // the equipment decides the branch
  }
  if (branchId && !(await Branch.exists({ _id: branchId, tenantId: req.scope.tenantId }))) return res.status(400).json({ message: 'Branch not found for this tenant' });

  const expense = await Expense.create({
    tenantId: req.scope.tenantId, branchId, category: b.category, amount: b.amount, date,
    paidTo: b.paidTo || undefined, method: b.method || 'cash', note: b.note || undefined,
    equipmentId: b.equipmentId || null, createdBy: req.user._id,
  });
  logAudit(req, 'CREATE_EXPENSE', { type: 'Expense', id: expense._id });
  res.status(201).json(present(expense));
};

const findVisible = (req) => Expense.findOne({ ...visible(req), _id: req.params.id });

exports.update = async (req, res) => {
  const expense = await findVisible(req);
  if (!expense) return res.status(404).json({ message: 'Expense not found' });
  if (expense.voided) return res.status(400).json({ message: 'A voided expense cannot be changed.' });
  if (expense.payrollKey) return res.status(400).json({ message: 'A payroll row is voided and run again, not edited.' });
  const b = req.body;
  if (b.category !== undefined) {
    if (!isAdmin(req) && SALARY_CATEGORIES.includes(b.category)) return res.status(403).json({ message: 'Only the gym owner records salaries.' });
    expense.category = b.category;
  }
  if (b.amount !== undefined) expense.amount = b.amount;
  if (b.date !== undefined) {
    const date = readDate(b.date);
    if (!date) return res.status(400).json({ message: 'The date is not valid.' });
    expense.date = date;
  }
  if (b.paidTo !== undefined) expense.paidTo = b.paidTo || undefined;
  if (b.method !== undefined) expense.method = b.method;
  if (b.note !== undefined) expense.note = b.note || undefined;
  await expense.save();
  logAudit(req, 'UPDATE_EXPENSE', { type: 'Expense', id: expense._id });
  res.json(present(expense));
};

exports.void = async (req, res) => {
  const expense = await findVisible(req);
  if (!expense) return res.status(404).json({ message: 'Expense not found' });
  if (!expense.voided) {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 200) : '';
    Object.assign(expense, { voided: true, voidedAt: new Date(), voidedBy: req.user._id, voidReason: reason || undefined });
    await expense.save();
    logAudit(req, 'VOID_EXPENSE', { type: 'Expense', id: expense._id });
  }
  res.json(present(expense));
};

exports.putReceipt = async (req, res) => {
  const expense = await findVisible(req);
  if (!expense) return res.status(404).json({ message: 'Expense not found' });
  const checked = checkPhoto(req.body && req.body.image);
  if (checked.message) return res.status(checked.status).json({ message: checked.message });
  const previous = expense.receiptFile;
  expense.receiptFile = await storePhoto(RECEIPT_FOLDER, expense._id, checked.buf, checked.type);
  await expense.save();
  await removePhotoFile(RECEIPT_FOLDER, previous);
  logAudit(req, 'ATTACH_EXPENSE_RECEIPT', { type: 'Expense', id: expense._id });
  res.json({ hasReceipt: true });
};

exports.getReceipt = async (req, res) => {
  const expense = await findVisible(req);
  if (!expense || !expense.receiptFile) return res.status(404).json({ message: 'No receipt' });
  return sendPhoto(res, RECEIPT_FOLDER, expense.receiptFile);
};

// Money in against money out for a period (this month by default), with the last six months for the chart.
exports.summary = async (req, res) => {
  const admin = isAdmin(req);
  const now = new Date();
  const from = q.date(req.query.from, 'from') || new Date(now.getFullYear(), now.getMonth(), 1);
  const to = q.date(req.query.to, 'to') ? dayEnd(q.date(req.query.to, 'to')) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const tenantId = oid(req.scope.tenantId);
  const branch = req.scope.branchId ? { branchId: oid(req.scope.branchId) } : {};
  const expenseMatch = { tenantId, voided: false, ...branch, ...(admin ? {} : { category: { $nin: SALARY_CATEGORIES } }) };
  const paymentMatch = { tenantId, status: 'paid', ...branch };

  // Six calendar months ending with the month of `to`.
  const months = Array.from({ length: 6 }, (_, i) => {
    const m = new Date(to.getFullYear(), to.getMonth() - (5 - i), 1);
    return { key: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`, label: m.toLocaleString('en-US', { month: 'short', year: '2-digit' }) };
  });
  const windowStart = new Date(`${months[0].key}-01`);
  const byMonth = (field) => ({ $dateToString: { format: '%Y-%m', date: field } });

  const [byCategory, byBranch, collectedAgg, expMonthly, payMonthly] = await Promise.all([
    Expense.aggregate([{ $match: { ...expenseMatch, date: { $gte: from, $lte: to } } }, { $group: { _id: '$category', total: { $sum: '$amount' } } }, { $sort: { total: -1 } }]),
    admin && !req.scope.branchId
      ? Expense.aggregate([{ $match: { ...expenseMatch, date: { $gte: from, $lte: to } } }, { $group: { _id: '$branchId', total: { $sum: '$amount' } } }, { $sort: { total: -1 } }])
      : [],
    MemberPayment.aggregate([{ $match: { ...paymentMatch, paidAt: { $gte: from, $lte: to } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Expense.aggregate([{ $match: { ...expenseMatch, date: { $gte: windowStart, $lte: to } } }, { $group: { _id: byMonth('$date'), total: { $sum: '$amount' } } }]),
    MemberPayment.aggregate([{ $match: { ...paymentMatch, paidAt: { $gte: windowStart, $lte: to } } }, { $group: { _id: byMonth('$paidAt'), total: { $sum: '$amount' } } }]),
  ]);

  const totalExpenses = byCategory.reduce((s, c) => s + c.total, 0);
  const collected = collectedAgg[0]?.total || 0;
  res.json({
    from, to,
    totalExpenses,
    collected,
    // A manager sees the costs of their branch without salaries, so a "net" would be misleading: only the owner gets one.
    net: admin ? collected - totalExpenses : null,
    partial: !admin,
    byCategory: byCategory.map((c) => ({ category: c._id, total: c.total })),
    byBranch: byBranch.map((b) => ({ branchId: b._id, total: b.total })),
    monthly: months.map((m) => ({
      month: m.label,
      expenses: expMonthly.find((x) => x._id === m.key)?.total || 0,
      collected: payMonthly.find((x) => x._id === m.key)?.total || 0,
    })),
  });
};
