const mongoose = require('mongoose');

// One attempt by a gym owner to buy or renew a plan. Step 1 is paid by scanning the platform's UPI QR and confirmed by hand;
// the same record is what a payment gateway will fill in later, so `method` and `gateway` are already here.
const STATUSES = ['created', 'awaiting_confirmation', 'paid', 'rejected', 'expired', 'cancelled'];

const subscriptionOrderSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  packageId: { type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionPackage', required: true },
  packageName: { type: String, required: true }, // as it was when ordered: a later rename must not rewrite history
  // upgrade = a trial becoming paid, renewal = the same package again, change = a different package
  kind: { type: String, enum: ['upgrade', 'renewal', 'change'], required: true },
  periods: { type: Number, required: true, min: 1, max: 12 },
  months: { type: Number, required: true, min: 1, max: 60 },
  // Money, all fixed when the order is made so a later price change cannot alter what the gym was asked to pay.
  amount: { type: Number, required: true, min: 0 },
  gstPercent: { type: Number, default: 0 },
  gstAmount: { type: Number, default: 0 },
  total: { type: Number, required: true, min: 0.01 },
  currency: { type: String, default: 'INR' },
  status: { type: String, enum: STATUSES, default: 'created' },
  method: { type: String, enum: ['upi_qr_manual', 'razorpay_checkout', 'razorpay_qr', 'razorpay_subscription'], default: 'upi_qr_manual' },
  gateway: { orderId: String, paymentId: String, qrId: String, subscriptionId: String },
  // The code the owner puts in the payment note so staff can find the payment in the bank statement.
  reference: { type: String, required: true, unique: true },
  // The bank's 12-digit transaction number, entered by the owner after paying. `utrKey` mirrors it only while the order is
  // waiting or paid, so a number cannot back two orders, but a rejected (mistyped) one can be entered again.
  utr: { type: String },
  utrKey: { type: String },
  proofFile: { type: String },
  expiresAt: { type: Date, required: true },
  submittedAt: { type: Date },
  paidAt: { type: Date },
  receivedAmount: { type: Number },
  appliedAt: { type: Date },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'TenantSubscriptionInvoice' },
  periodStart: { type: Date },
  periodEnd: { type: Date },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectReason: { type: String, trim: true, maxlength: 200 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

subscriptionOrderSchema.index({ tenantId: 1, createdAt: -1 });
subscriptionOrderSchema.index({ status: 1, createdAt: -1 });
subscriptionOrderSchema.index({ utrKey: 1 }, { unique: true, partialFilterExpression: { utrKey: { $exists: true } } });

const SubscriptionOrder = mongoose.model('SubscriptionOrder', subscriptionOrderSchema);
SubscriptionOrder.STATUSES = STATUSES;
module.exports = SubscriptionOrder;
