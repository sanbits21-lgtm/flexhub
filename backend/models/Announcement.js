const mongoose = require('mongoose');

// A notice a manager or the owner publishes to members: news, an offer, a heads-up. Members read it in the app.
// Nothing is pushed or queued: each member's list is worked out when they open the app, from the branch, status,
// expiry and plan recorded on them (see utils/notices.js), so it can never reach another gym.
const KINDS = ['news', 'offer', 'notice'];
const AUDIENCES = ['everyone', 'active', 'expiring', 'expired', 'plan'];

const announcementSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  // Empty = every branch of the gym.
  branchIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Branch' }],
  title: { type: String, required: true, trim: true, maxlength: 80 },
  body: { type: String, required: true, trim: true, maxlength: 1000 },
  kind: { type: String, enum: KINDS, default: 'news' },
  audience: {
    type: { type: String, enum: AUDIENCES, default: 'everyone' },
    days: { type: Number, min: 1, max: 60, default: 7 }, // for "expiring": membership ends within this many days
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'MembershipPlan', default: null }, // for "plan"
  },
  startsAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: null },
  link: { type: String, trim: true, maxlength: 300 },
  status: { type: String, enum: ['published', 'withdrawn'], default: 'published' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdByName: { type: String },
}, { timestamps: true });

announcementSchema.index({ tenantId: 1, status: 1, startsAt: -1 });

announcementSchema.plugin(require('../utils/tenantRefs'), { branchIds: 'Branch', 'audience.planId': 'MembershipPlan' });

const Announcement = mongoose.model('Announcement', announcementSchema);
Announcement.KINDS = KINDS;
Announcement.AUDIENCES = AUDIENCES;
module.exports = Announcement;
