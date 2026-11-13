const mongoose = require('mongoose');

const classTypeSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  // null/absent = tenant-wide template, schedulable at every branch. Set = only that
  // branch can schedule sessions of it. Same convention as MembershipPlan.branchId.
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
  name: { type: String, required: true, trim: true },
  description: { type: String },
  durationMinutes: { type: Number, required: true, min: 1 },
  defaultCapacity: { type: Number, required: true, min: 1 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

classTypeSchema.index({ tenantId: 1, isActive: 1 });
classTypeSchema.index({ tenantId: 1, branchId: 1 });

// Gym isolation: this record may only point at records of its own gym (see utils/tenantRefs.js).
classTypeSchema.plugin(require('../utils/tenantRefs'), { branchId: 'Branch' });

module.exports = mongoose.model('ClassType', classTypeSchema);
