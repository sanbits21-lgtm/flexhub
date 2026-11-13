const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const memberSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
  memberCode: { type: String, required: true, unique: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, lowercase: true, trim: true },
  phone: { type: String, required: true, trim: true },
  password: { type: String, required: true },
  photoUrl: { type: String },
  dob: { type: Date },
  gender: { type: String, enum: ['male', 'female', 'other', 'prefer_not_say'] },
  emergencyContact: {
    name: String,
    phone: String,
  },
  membershipPlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'MembershipPlan' },
  membershipStart: { type: Date },
  membershipEnd: { type: Date },
  membershipStatus: { type: String, enum: ['active', 'expired', 'frozen', 'cancelled'], default: 'active' },
  bodyMetrics: [{
    date: { type: Date, default: Date.now },
    weightKg: Number,
    heightCm: Number,
    bodyFatPct: Number,
    notes: String,
    // Who recorded it: the member in the app, or (absent) staff. A member can delete only their own.
    source: { type: String, enum: ['member', 'staff'] },
  }],
  // Values for the gym's own extra fields, keyed by Tenant.memberFields[].key. Staff-facing only:
  // never returned to the member app (see middleware/auth.js).
  customFields: { type: mongoose.Schema.Types.Mixed, default: undefined },
  healthNotes: { type: String, trim: true, maxlength: 500 },
  fitnessGoal: { type: String, enum: ['lose_fat', 'build_muscle', 'stay_fit', 'improve_endurance'] },
  experienceLevel: { type: String, enum: ['beginner', 'intermediate', 'advanced'] },
  dietPreference: { type: String, enum: ['veg', 'eggetarian', 'non_veg', 'vegan'] },
  assignedTrainerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  qrCode: { type: String, required: true, unique: true },
  isActive: { type: Boolean, default: true },
  // See User.passwordResetAt: set only by a staff-forced reset, revokes earlier sessions.
  passwordResetAt: { type: Date },
  // "Forgot password" by email (controllers/passwordResetController.js). Only the hash of the emailed
  // token is kept; it works once and expires. passwordResetAt (above) is a different thing: it records
  // that a password WAS reset, which ends earlier sessions.
  passwordResetTokenHash: { type: String },
  passwordResetTokenExpires: { type: Date },
  passwordResetRequestedAt: { type: Date },
}, { timestamps: true });

memberSchema.index({ tenantId: 1, branchId: 1 });
// One member per email WITHIN a gym. (It used to be unique across every gym on the platform,
// so a second gym could not enrol someone whose email another gym already had, and the
// refusal revealed that the email existed elsewhere.) Partial: members without an email are fine.
memberSchema.index({ tenantId: 1, email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });
memberSchema.index({ tenantId: 1, membershipStatus: 1, membershipEnd: 1 });

memberSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

memberSchema.methods.matchPassword = function (entered) {
  return bcrypt.compare(entered, this.password);
};

// Gym isolation: this record may only point at records of its own gym (see utils/tenantRefs.js).
memberSchema.plugin(require('../utils/tenantRefs'), { branchId: 'Branch', membershipPlanId: 'MembershipPlan', assignedTrainerId: 'User' });

module.exports = mongoose.model('Member', memberSchema);
