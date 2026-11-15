const mongoose = require('mongoose');

// Everything the gym pays out, one row each: salaries, maintenance, rent and the rest. Nothing is ever deleted: a
// mistaken row is voided (kept, marked, left out of every total), so the books keep their audit trail.
const SALARY_CATEGORIES = ['salary-trainer', 'salary-manager', 'salary-other'];
const CATEGORIES = [...SALARY_CATEGORIES, 'maintenance', 'rent', 'utilities', 'equipment', 'marketing', 'other'];
const METHODS = ['cash', 'upi', 'bank', 'cheque', 'other'];

const expenseSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  // null = a cost of the whole gym rather than one branch (head-office rent, a loan instalment)
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
  category: { type: String, enum: CATEGORIES, required: true },
  amount: { type: Number, required: true, min: 0.01 },
  date: { type: Date, required: true },
  // Who was paid, as printed in the list. staffId / payeeId link it to a person when there is one.
  paidTo: { type: String, trim: true, maxlength: 100 },
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  payeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payee', default: null },
  equipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Equipment', default: null },
  method: { type: String, enum: METHODS, default: 'cash' },
  note: { type: String, trim: true, maxlength: 300 },
  // File name of a photographed bill (utils/photos.js, folder expense-receipts). Never sent to clients: they get hasReceipt.
  receiptFile: { type: String },
  // Salary rows made by a payroll run. `payrollKey` is "<month>:<staff|payee>:<id>" and is unique among live rows,
  // so the same person cannot be paid twice for a month.
  payrollMonth: { type: String, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
  payrollKey: { type: String },
  base: { type: Number },
  bonus: { type: Number },
  deduction: { type: Number },
  voided: { type: Boolean, default: false },
  voidedAt: { type: Date },
  voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  voidReason: { type: String, trim: true, maxlength: 200 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

expenseSchema.index({ tenantId: 1, date: -1 });
expenseSchema.index({ tenantId: 1, branchId: 1, date: -1 });
expenseSchema.index({ payrollKey: 1 }, { unique: true, partialFilterExpression: { payrollKey: { $exists: true }, voided: false } });

expenseSchema.plugin(require('../utils/tenantRefs'), { branchId: 'Branch', staffId: 'User', payeeId: 'Payee', equipmentId: 'Equipment' });

const Expense = mongoose.model('Expense', expenseSchema);
Expense.CATEGORIES = CATEGORIES;
Expense.SALARY_CATEGORIES = SALARY_CATEGORIES;
Expense.METHODS = METHODS;
module.exports = Expense;
