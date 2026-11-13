const mongoose = require('mongoose');

const memberPaymentSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
  memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true },
  membershipPlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'MembershipPlan' },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  status: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
  method: { type: String, enum: ['cash', 'card', 'upi', 'netbanking', 'other'], default: 'cash' },
  gatewayRef: { type: String },
  // For UPI payments: the account the money was meant to land in, stamped by the server at the time
  // (a branch's own account, or the gym's default). Accounts change later; this does not.
  upiId: { type: String },
  invoiceNumber: { type: String, required: true, unique: true },
  paidAt: { type: Date },
}, { timestamps: true });

memberPaymentSchema.index({ tenantId: 1, branchId: 1, status: 1 });
memberPaymentSchema.index({ memberId: 1, createdAt: -1 });

// Gym isolation: this record may only point at records of its own gym (see utils/tenantRefs.js).
memberPaymentSchema.plugin(require('../utils/tenantRefs'), { branchId: 'Branch', memberId: 'Member', membershipPlanId: 'MembershipPlan' });

module.exports = mongoose.model('MemberPayment', memberPaymentSchema);
