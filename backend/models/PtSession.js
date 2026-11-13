const mongoose = require('mongoose');

// A one-to-one personal training session: one trainer, one member, one time slot.
// (Group classes live in ClassSession/Booking; this is deliberately separate because a
// PT session has no capacity, waitlist or class type.)
const ptSessionSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
  trainerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true },
  startAt: { type: Date, required: true },
  endAt: { type: Date, required: true },
  // Unlike class sessions, a past 'scheduled' session is NOT auto-completed: whether the
  // member turned up is the trainer's call, so it stays 'scheduled' until they mark it
  // (the apps flag these as "needs an outcome").
  status: { type: String, enum: ['scheduled', 'completed', 'no-show', 'cancelled'], default: 'scheduled' },
  focus: { type: String, trim: true, maxlength: 120 },
  notes: { type: String, trim: true, maxlength: 500 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  cancelledBy: { type: String, enum: ['trainer', 'staff', 'member'] },
  cancelledAt: { type: Date },
}, { timestamps: true });

ptSessionSchema.index({ tenantId: 1, branchId: 1, startAt: 1 });
ptSessionSchema.index({ trainerId: 1, startAt: 1, endAt: 1 });
ptSessionSchema.index({ memberId: 1, startAt: 1 });

// Gym isolation: this record may only point at records of its own gym (see utils/tenantRefs.js).
ptSessionSchema.plugin(require('../utils/tenantRefs'), { branchId: 'Branch', trainerId: 'User', memberId: 'Member' });

module.exports = mongoose.model('PtSession', ptSessionSchema);
