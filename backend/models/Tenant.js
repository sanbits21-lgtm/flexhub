const mongoose = require('mongoose');

const tenantSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  contactEmail: { type: String, required: true, lowercase: true, trim: true },
  contactPhone: { type: String, trim: true },
  billingPlan: { type: String, enum: ['trial', 'basic', 'pro', 'enterprise'], default: 'trial' },
  billingStatus: { type: String, enum: ['active', 'past_due', 'suspended', 'cancelled'], default: 'active' },
  maxBranches: { type: Number, default: 1 },
  // Own UPI collection details — no payment gateway involved. A QR/deep-link is
  // generated client-side from upiId; upiPaymentLink is an optional fallback (e.g. a
  // GPay/PhonePe business payment page) for tenants who'd rather paste an existing link.
  // Payment confirmation is manual (staff marks it paid after the member shows proof),
  // since there's no gateway callback to verify against.
  upiId: { type: String, trim: true, default: '' },
  upiPaymentLink: { type: String, trim: true, default: '' },
  // Per-tenant overrides of backend/config/featureRegistry.js — platform-admin only
  // (see backend/routes/tenants.js GET/PUT /:id/features). Sparse by design: an empty
  // map means every flag sits at its registry default, so existing tenants are
  // unaffected until a platform-admin explicitly overrides something. Resolved via
  // backend/utils/features.js resolveFeatures(), never read directly.
  features: { type: Map, of: Boolean, default: {} },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

tenantSchema.index({ isActive: 1 });

module.exports = mongoose.model('Tenant', tenantSchema);
