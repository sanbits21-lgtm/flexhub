const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const ROLES = ['super-admin', 'platform-admin', 'tenant-admin', 'branch-manager', 'trainer'];

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, required: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ROLES, required: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
  managedTenantIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' }],
  specialization: { type: String, trim: true },
  salary: { type: Number, default: null },
  isActive: { type: Boolean, default: true },
  lastLoginAt: { type: Date },
}, { timestamps: true });

userSchema.index({ tenantId: 1, branchId: 1 });
userSchema.index({ role: 1 });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.matchPassword = function (entered) {
  return bcrypt.compare(entered, this.password);
};

module.exports = mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
