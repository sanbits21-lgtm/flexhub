const mongoose = require('mongoose');

const tenantSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  // `slug` is the gym's subdomain (iron.example.com). When it changes, the old one is kept
  // here until `until`, so old links redirect instead of breaking (see utils/subdomain.js).
  previousSlugs: [{ _id: false, slug: String, until: Date }],
  // White-label look shown on the gym's login page and in its staff website.
  brand: {
    color: { type: String, default: '' },
    // Optional second colour: with it the accent becomes a linear gradient from `color` to `color2`.
    color2: { type: String, default: '' },
    gradientAngle: { type: Number, enum: [90, 135, 180], default: 135 },
    logoUrl: { type: String, default: '' },
    tagline: { type: String, trim: true, maxlength: 80, default: '' },
  },
  // The gym's own extra member fields (see utils/memberFields.js). Values live on each member.
  memberFields: [{
    _id: false,
    key: { type: String, required: true },
    label: { type: String, required: true, trim: true, maxlength: 40 },
    type: { type: String, enum: ['text', 'number', 'date'], default: 'text' },
  }],
  contactEmail: { type: String, required: true, lowercase: true, trim: true },
  contactPhone: { type: String, trim: true },
  billingPlan: { type: String, enum: ['trial', 'basic', 'pro', 'enterprise'], default: 'trial' },
  billingStatus: { type: String, enum: ['active', 'past_due', 'suspended', 'cancelled'], default: 'active' },
  maxBranches: { type: Number, default: 1 },
  // Free-trial terms. No end date = never expires (gyms created by platform staff);
  // `maxMembers` unset = uncapped. Both are cleared when the gym moves to a paid plan.
  trialEndsAt: { type: Date },
  maxMembers: { type: Number },
  signupSource: { type: String, enum: ['platform', 'self'], default: 'platform' },
  // Self-registered gyms wait here until a platform administrator approves them. Everything
  // else (and every gym that existed before approvals) is 'approved'.
  approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved' },
  approvedAt: { type: Date },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectionReason: { type: String, trim: true, maxlength: 200 },
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
tenantSchema.index({ 'previousSlugs.slug': 1 });

module.exports = mongoose.model('Tenant', tenantSchema);
