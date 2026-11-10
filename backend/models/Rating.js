const mongoose = require('mongoose');

// A member's rating of their gym (branch) or of one of its trainers. One per member per target:
// rating again replaces the earlier one rather than adding to it, so nobody can stack votes.
// The member is stored so that can be enforced, but is never shown to anyone: managers and owners
// see the score and the words, not who wrote them.
const ratingSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
  memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true },
  targetType: { type: String, enum: ['gym', 'trainer'], required: true },
  trainerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  stars: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, trim: true, maxlength: 500, default: '' },
}, { timestamps: true });

ratingSchema.index({ memberId: 1, targetType: 1, trainerId: 1 }, { unique: true });
ratingSchema.index({ tenantId: 1, branchId: 1, targetType: 1 });

module.exports = mongoose.model('Rating', ratingSchema);
