const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  // Denormalized from the session (same reasoning as MemberPayment denormalizing
  // tenantId/branchId) so scope filtering never needs a populate.
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
  classSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ClassSession', required: true },
  memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true },
  status: { type: String, enum: ['booked', 'waitlisted', 'cancelled', 'attended', 'no-show'], default: 'booked' },
  bookedAt: { type: Date, default: Date.now },
  bookedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  cancelledAt: { type: Date, default: null },
  markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  markedAt: { type: Date, default: null },
}, { timestamps: true });

bookingSchema.index({ tenantId: 1, branchId: 1 });
// Capacity counts and waitlist ordering both filter/group on this pair.
bookingSchema.index({ classSessionId: 1, status: 1 });
// Blocks a member from having two simultaneous ACTIVE bookings on the same session
// (booked/waitlisted/attended/no-show), but a fresh booking after a cancel just works —
// the partial filter excludes cancelled rows from the uniqueness constraint entirely.
bookingSchema.index(
  { memberId: 1, classSessionId: 1 },
  { unique: true, partialFilterExpression: { status: { $ne: 'cancelled' } } }
);

// Gym isolation: this record may only point at records of its own gym (see utils/tenantRefs.js).
bookingSchema.plugin(require('../utils/tenantRefs'), { branchId: 'Branch', classSessionId: 'ClassSession', memberId: 'Member' });

module.exports = mongoose.model('Booking', bookingSchema);
