const mongoose = require('mongoose');

// Someone the gym pays a monthly salary who has no login in the app: a cleaner, a receptionist, a physiotherapist.
// Trainers and branch managers are paid from their own account's `salary`; this is for everyone else.
const payeeSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  roleLabel: { type: String, trim: true, maxlength: 60 },
  monthlySalary: { type: Number, default: 0, min: 0, max: 10_000_000 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

payeeSchema.index({ tenantId: 1, isActive: 1 });

payeeSchema.plugin(require('../utils/tenantRefs'), { branchId: 'Branch' });

module.exports = mongoose.model('Payee', payeeSchema);
