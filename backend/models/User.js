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
  // File name of the profile picture (see utils/photos.js). Never sent to clients: they get hasPhoto.
  photoUrl: { type: String },
  salary: { type: Number, default: null },
  isActive: { type: Boolean, default: true },
  lastLoginAt: { type: Date },
  // Set when someone ELSE resets this password. Tokens issued before it stop working. Not set
  // by a user changing their own password, so that does not log them out of the session
  // they are changing it in.
  passwordResetAt: { type: Date },
  // Only self-registered owners start unverified; everyone else is created by someone who
  // vouches for them, so the default is verified. The token itself is never stored: only its hash.
  emailVerified: { type: Boolean, default: true },
  emailVerifyHash: { type: String },
  emailVerifyExpires: { type: Date },
  emailVerifySentAt: { type: Date },
  // When we last told this address "you already have an account" (see signupController.noticeToExistingAccount).
  accountNoticeSentAt: { type: Date },
}, { timestamps: true });
userSchema.index({ emailVerifyHash: 1 }, { sparse: true });

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
