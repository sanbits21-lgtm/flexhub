const mongoose = require('mongoose');
const { DURATION_UNITS } = require('../utils/planDuration');

const membershipPlanSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  // Empty = available at every branch (including ones added later). Otherwise only these branches can enroll
  // members into it. See utils/planBranches.js.
  branchIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Branch' }],
  name: { type: String, required: true, trim: true },
  durationUnit: { type: String, enum: DURATION_UNITS, required: true },
  price: { type: Number, required: true },
  description: { type: String },
  features: [{ type: String }],
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

membershipPlanSchema.index({ tenantId: 1, isActive: 1 });
membershipPlanSchema.index({ tenantId: 1, branchIds: 1 });

// Gym isolation: this record may only point at records of its own gym (see utils/tenantRefs.js).
membershipPlanSchema.plugin(require('../utils/tenantRefs'), { branchIds: 'Branch' });

module.exports = mongoose.model('MembershipPlan', membershipPlanSchema);
