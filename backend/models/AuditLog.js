const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null },
  actorId: { type: mongoose.Schema.Types.ObjectId }, // User for staff, Member for member actions — no single ref target
  actorRole: { type: String },
  // Snapshot at write time (not populated at read time) — actorId's ref target differs by
  // actorRole (User vs Member), so a simple `ref` can't resolve both; this also survives
  // the actor being later renamed or deactivated, which a live populate wouldn't.
  actorName: { type: String },
  actorEmail: { type: String },
  action: { type: String, required: true },
  targetType: { type: String },
  targetId: { type: mongoose.Schema.Types.ObjectId },
  metadata: { type: mongoose.Schema.Types.Mixed },
  ip: { type: String },
}, { timestamps: { createdAt: true, updatedAt: false } });

auditLogSchema.index({ tenantId: 1, createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
