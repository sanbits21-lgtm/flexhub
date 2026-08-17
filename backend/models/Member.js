const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const memberSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
  memberCode: { type: String, required: true, unique: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, lowercase: true, trim: true, sparse: true, unique: true },
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
  }],
  assignedTrainerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  qrCode: { type: String, required: true, unique: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

memberSchema.index({ tenantId: 1, branchId: 1 });
memberSchema.index({ tenantId: 1, membershipStatus: 1, membershipEnd: 1 });

memberSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

memberSchema.methods.matchPassword = function (entered) {
  return bcrypt.compare(entered, this.password);
};

module.exports = mongoose.model('Member', memberSchema);
