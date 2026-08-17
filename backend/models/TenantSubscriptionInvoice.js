const mongoose = require('mongoose');

const tenantSubscriptionInvoiceSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  billingPlan: { type: String },
  periodStart: { type: Date },
  periodEnd: { type: Date },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'paid', 'failed', 'void'], default: 'pending' },
  gatewayRef: { type: String },
}, { timestamps: true });

tenantSubscriptionInvoiceSchema.index({ tenantId: 1, periodStart: -1 });

module.exports = mongoose.model('TenantSubscriptionInvoice', tenantSubscriptionInvoiceSchema);
