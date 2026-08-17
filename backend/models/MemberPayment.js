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
  invoiceNumber: { type: String, required: true, unique: true },
  paidAt: { type: Date },
}, { timestamps: true });

memberPaymentSchema.index({ tenantId: 1, branchId: 1, status: 1 });
memberPaymentSchema.index({ memberId: 1, createdAt: -1 });

module.exports = mongoose.model('MemberPayment', memberPaymentSchema);
