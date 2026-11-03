const mongoose = require('mongoose');

const classSessionSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
  classTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'ClassType', required: true },
  trainerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  startAt: { type: Date, required: true },
  endAt: { type: Date, required: true },
  // null = inherit classType.defaultCapacity at read/booking time. Set = override for
  // this occurrence only. Deliberately not snapshotted on create — fewer fields to
  // backfill, same "override if you must, otherwise inherit" pattern as
  // MembershipPlan.branchId. Trade-off: editing the class type's defaultCapacity later
  // silently changes capacity for every session still inheriting it — accepted as the
  // simpler of two reasonable designs.
  capacity: { type: Number, default: null, min: 1 },
  // 'completed' is never set here — it's derived at read time from endAt vs now (see
  // utils/classSessionStatus.js), same reason Member.membershipStatus is derived rather
  // than relying on something to flip it. Only 'cancelled' is ever written directly, by
  // staff, and is never overwritten by the derivation.
  status: { type: String, enum: ['scheduled', 'cancelled', 'completed'], default: 'scheduled' },
  notes: { type: String },
}, { timestamps: true });

classSessionSchema.index({ tenantId: 1, branchId: 1, startAt: 1 });
classSessionSchema.index({ trainerId: 1, startAt: 1, endAt: 1 });
classSessionSchema.index({ classTypeId: 1 });

module.exports = mongoose.model('ClassSession', classSessionSchema);
