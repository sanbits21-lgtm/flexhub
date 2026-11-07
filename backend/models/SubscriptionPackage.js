const mongoose = require('mongoose');

// A plan a gym can pick when it registers, set up by the super-admin. Gyms get its limits when
// a platform administrator approves them (see tenantController.approve); a change here applies
// to FUTURE approvals only, never to gyms already running.
const subscriptionPackageSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 40 },
  description: { type: String, trim: true, maxlength: 200, default: '' },
  // 0 = free. Shown on the registration page; billing itself is handled outside the app.
  price: { type: Number, min: 0, default: 0 },
  billingCycle: { type: String, enum: ['monthly', 'quarterly', 'yearly'], default: 'monthly' },
  // Free days from approval. 0 = no trial: the package is live as soon as it is approved.
  trialDays: { type: Number, min: 0, max: 365, default: 0 },
  maxBranches: { type: Number, min: 1, max: 100, default: 1 },
  // Unset = unlimited.
  maxMembers: { type: Number, min: 1, max: 100000 },
  highlights: [{ type: String, trim: true, maxlength: 80 }],
  isFeatured: { type: Boolean, default: false },
  // Hidden packages stay on gyms that already have them but cannot be chosen at registration.
  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
}, { timestamps: true });

subscriptionPackageSchema.index({ isActive: 1, sortOrder: 1 });

module.exports = mongoose.model('SubscriptionPackage', subscriptionPackageSchema);
