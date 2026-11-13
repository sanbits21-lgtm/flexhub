const mongoose = require('mongoose');

const equipmentSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
  name: { type: String, required: true, trim: true },
  category: { type: String, trim: true },
  purchaseDate: { type: Date },
  warrantyExpiry: { type: Date },
  status: { type: String, enum: ['operational', 'under_maintenance', 'retired'], default: 'operational' },
  lastServicedAt: { type: Date },
  nextServiceDue: { type: Date },
  notes: { type: String },
}, { timestamps: true });

equipmentSchema.index({ tenantId: 1, branchId: 1 });
equipmentSchema.index({ nextServiceDue: 1 });

// Gym isolation: this record may only point at records of its own gym (see utils/tenantRefs.js).
equipmentSchema.plugin(require('../utils/tenantRefs'), { branchId: 'Branch' });

module.exports = mongoose.model('Equipment', equipmentSchema);
