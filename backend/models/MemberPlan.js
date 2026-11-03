const mongoose = require('mongoose');

// A generated workout or diet plan. Kept as history (newest wins) rather than overwritten,
// so a member can regenerate without losing the previous one and so the daily generation
// limit can be counted from real rows.
const memberPlanSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
  memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true },
  type: { type: String, enum: ['workout', 'diet'], required: true },
  // 'ai' = written by a model, 'rules' = built-in generator (no key, flag off, or AI failed),
  // 'staff' = written or edited by a trainer / branch manager for this member.
  source: { type: String, enum: ['ai', 'rules', 'staff'], required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdByName: { type: String, trim: true },
  // A staff plan can be withdrawn (hidden from the member) without losing the record.
  isActive: { type: Boolean, default: true },
  content: { type: mongoose.Schema.Types.Mixed, required: true },
}, { timestamps: true });

memberPlanSchema.index({ memberId: 1, type: 1, createdAt: -1 });

module.exports = mongoose.model('MemberPlan', memberPlanSchema);
