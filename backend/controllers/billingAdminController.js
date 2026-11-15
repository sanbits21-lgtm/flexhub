const SubscriptionOrder = require('../models/SubscriptionOrder');
const SubscriptionPackage = require('../models/SubscriptionPackage');
const Tenant = require('../models/Tenant');
const q = require('../utils/query');
const { applyPurchase } = require('../utils/billing');
const { ownerEmails, fmt } = require('../utils/expiryNotices');
const { gymLoginUrl } = require('../utils/links');
const { templated } = require('../utils/mailer');
const { sendPhoto } = require('../utils/photos');
const { logAudit } = require('../utils/audit');
const { view, PROOF_FOLDER } = require('./billingController');

// Platform staff confirming that a gym's payment really arrived. A scoped platform admin only sees their own gyms
// (req.scope carries that, exactly as it does for the tenant list).

const STATUS_FILTERS = [...SubscriptionOrder.STATUSES, 'all'];

exports.list = async (req, res) => {
  const status = q.oneOf(req.query.status, STATUS_FILTERS, 'status') || 'awaiting_confirmation';
  const filter = { ...req.scope };
  if (status !== 'all') filter.status = status;
  const rows = await SubscriptionOrder.find(filter).sort({ submittedAt: 1, createdAt: -1 }).limit(100).lean();
  const tenants = await Tenant.find({ _id: { $in: rows.map((r) => r.tenantId) } }).select('name slug contactEmail').lean();
  const byId = new Map(tenants.map((t) => [String(t._id), t]));
  res.json(rows.map((r) => ({ ...view(r), tenant: byId.get(String(r.tenantId)) || null })));
};

const find = (req, status) => SubscriptionOrder.findOne({ ...req.scope, _id: req.params.id, ...(status ? { status } : {}) });

exports.getProof = async (req, res) => {
  const order = await find(req);
  if (!order || !order.proofFile) return res.status(404).json({ message: 'No proof' });
  return sendPhoto(res, PROOF_FOLDER, order.proofFile);
};

// "I have checked the bank and the money is there." The amount is typed in so it has to be looked at, not just clicked.
exports.approve = async (req, res) => {
  const received = Number(req.body.received);
  const order = await find(req);
  if (!order) return res.status(404).json({ message: 'Order not found' });
  if (order.status !== 'awaiting_confirmation') return res.status(409).json({ message: 'This payment was already handled.' });
  if (!(received >= order.total)) return res.status(400).json({ message: `The payment due is Rs ${order.total}. If less arrived, reject it and ask the gym to pay the full amount.` });

  // Claim it with one conditional write, so two admins (or a double click) cannot apply it twice.
  const claimed = await SubscriptionOrder.findOneAndUpdate(
    { _id: order._id, status: 'awaiting_confirmation' },
    { $set: { status: 'paid', paidAt: new Date(), receivedAmount: received, reviewedBy: req.user._id } },
    { new: true },
  );
  if (!claimed) return res.status(409).json({ message: 'This payment was already handled.' });

  try {
    const tenant = await Tenant.findById(claimed.tenantId);
    const pkg = await SubscriptionPackage.findById(claimed.packageId);
    if (!tenant || !pkg) throw new Error('The gym or package no longer exists.');
    const done = await applyPurchase({ tenant, pkg, months: claimed.months, total: claimed.total, reference: claimed.reference });
    claimed.appliedAt = new Date();
    claimed.invoiceId = done.invoice._id;
    claimed.periodStart = done.periodStart;
    claimed.periodEnd = done.periodEnd;
    await claimed.save();

    const to = await ownerEmails(tenant);
    await Promise.all(to.map((email) => templated({
      to: email,
      subject: `Payment received: ${tenant.name} is active until ${fmt(done.periodEnd)}`,
      heading: 'Thank you, your payment is confirmed',
      body: `${tenant.name} is on ${pkg.name} until ${fmt(done.periodEnd)}. Reference ${claimed.reference}.`,
      buttonText: 'Open FitzyClub',
      buttonUrl: gymLoginUrl(tenant, req),
    })));
    logAudit(req, 'APPROVE_BILLING_PAYMENT', { type: 'SubscriptionOrder', id: claimed._id, metadata: { tenantId: String(tenant._id), total: claimed.total, received } });
    res.json({ ...view(claimed), tenant: { _id: tenant._id, name: tenant.name } });
  } catch (err) {
    // Nothing was applied: put it back in the queue rather than lose it.
    await SubscriptionOrder.updateOne({ _id: claimed._id, appliedAt: { $exists: false } }, { $set: { status: 'awaiting_confirmation' }, $unset: { paidAt: '', receivedAmount: '', reviewedBy: '' } });
    throw err;
  }
};

exports.reject = async (req, res) => {
  const reason = String(req.body.reason || '').trim().slice(0, 200);
  const order = await SubscriptionOrder.findOneAndUpdate(
    { ...req.scope, _id: req.params.id, status: 'awaiting_confirmation' },
    { $set: { status: 'rejected', rejectReason: reason, reviewedBy: req.user._id }, $unset: { utrKey: '' } },
    { new: true },
  );
  if (!order) return res.status(409).json({ message: 'This payment was already handled, or does not exist.' });
  const tenant = await Tenant.findById(order.tenantId);
  const to = await ownerEmails(tenant);
  await Promise.all(to.map((email) => templated({
    to: email,
    subject: `We could not confirm your payment for ${tenant.name}`,
    heading: 'We could not confirm your payment',
    body: `Reason: ${reason}. Reference ${order.reference}. If you did pay, reply to this email with the payment screenshot, or start again from Billing.`,
  })));
  logAudit(req, 'REJECT_BILLING_PAYMENT', { type: 'SubscriptionOrder', id: order._id, metadata: { reason } });
  res.json(view(order));
};
