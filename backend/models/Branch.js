const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  name: { type: String, required: true, trim: true },
  address: {
    line1: String,
    city: String,
    state: String,
    postalCode: String,
    country: String,
  },
  phone: { type: String, trim: true },
  timezone: { type: String, default: 'Asia/Kolkata' },
  capacity: { type: Number },
  // This branch's own UPI account. Empty = the branch collects into the gym's default account
  // (Tenant.upiId). See utils/paymentAccounts.js for how the two combine.
  upiId: { type: String, trim: true, default: '' },
  upiPaymentLink: { type: String, trim: true, default: '' },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

branchSchema.index({ tenantId: 1, isActive: 1 });

module.exports = mongoose.model('Branch', branchSchema);
