const mongoose = require('mongoose');
const { DURATION_UNITS } = require('../utils/planDuration');

const membershipPlanSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  // null/absent = tenant-wide plan, available at every branch. Set = only that branch can enroll members into it.
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
  name: { type: String, required: true, trim: true },
  durationUnit: { type: String, enum: DURATION_UNITS, required: true },
  price: { type: Number, required: true },
  description: { type: String },
  features: [{ type: String }],
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

membershipPlanSchema.index({ tenantId: 1, isActive: 1 });
membershipPlanSchema.index({ tenantId: 1, branchId: 1 });

module.exports = mongoose.model('MembershipPlan', membershipPlanSchema);
