const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
  memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true },
  checkInAt: { type: Date, required: true, default: Date.now },
  checkOutAt: { type: Date, default: null },
  method: { type: String, enum: ['qr', 'manual', 'biometric'], default: 'qr' },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

attendanceSchema.index({ tenantId: 1, branchId: 1, checkInAt: -1 });
attendanceSchema.index({ memberId: 1, checkInAt: -1 });

// Gym isolation: this record may only point at records of its own gym (see utils/tenantRefs.js).
attendanceSchema.plugin(require('../utils/tenantRefs'), { branchId: 'Branch', memberId: 'Member' });

module.exports = mongoose.model('Attendance', attendanceSchema);
