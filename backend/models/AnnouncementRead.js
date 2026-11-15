const mongoose = require('mongoose');

// "This member has opened this notice." A row per member per notice, kept apart from the notice so that a notice
// sent to thousands of members does not grow one document without limit.
const announcementReadSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  announcementId: { type: mongoose.Schema.Types.ObjectId, ref: 'Announcement', required: true },
  memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true },
  readAt: { type: Date, default: Date.now },
});

announcementReadSchema.index({ announcementId: 1, memberId: 1 }, { unique: true });
announcementReadSchema.index({ memberId: 1 });

announcementReadSchema.plugin(require('../utils/tenantRefs'), { announcementId: 'Announcement', memberId: 'Member' });

module.exports = mongoose.model('AnnouncementRead', announcementReadSchema);
