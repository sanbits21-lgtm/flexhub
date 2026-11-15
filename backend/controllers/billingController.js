const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Member = require('../models/Member');
const Branch = require('../models/Branch');
const SubscriptionPackage = require('../models/SubscriptionPackage');
const SubscriptionOrder = require('../models/SubscriptionOrder');
const TenantSubscriptionInvoice = require('../models/TenantSubscriptionInvoice');
const { getSettings } = require('../utils/platformSettings');
const { subscriptionOf } = require('../utils/subscription');
const { quote, maxPeriods, kindOf, newReference, limitProblem, ORDER_HOURS } = require('../utils/billing');
const { checkPhoto, storePhoto, removePhotoFile, sendPhoto } = require('../utils/photos');
const { templated } = require('../utils/mailer');
const { logAudit } = require('../utils/audit');

const PROOF_FOLDER = 'billing-proofs';
const OPEN = ['created', 'awaiting_confirmation'];

// A gym owner buying or renewing a plan. Step 1: pay the platform's UPI QR, tell us the bank's transaction number, and a
// platform admin confirms. Nothing here trusts the browser about money: the amount is worked out on the server.

/** Orders nobody paid in time are closed, the moment anyone looks. */
const closeStale = (tenantId) => SubscriptionOrder.updateMany(
  { tenantId, status: 'created', expiresAt: { $lt: new Date() } },
  { $set: { status: 'expired' } },
);

const upiLink = (settings, order) => {
  const p = new URLSearchParams();
  p.set('pa', settings.billingUpiId);
  if (settings.billingPayeeName) p.set('pn', settings.billingPayeeName);
  p.set('am', order.total.toFixed(2));
  p.set('cu', 'INR');
  p.set('tn', order.reference);
  return `upi://pay?${p.toString()}`;
};

// What the owner may see of an order. Never the proof's file name or the internal UTR key.
const view = (o, settings) => {
  const { proofFile, utrKey, ...rest } = o.toObject ? o.toObject() : o;
  const out = { ...rest, hasProof: !!proofFile };
  if (settings && ['created', 'awaiting_confirmation'].includes(o.status)) {
    out.payment = { upiId: settings.billingUpiId, payeeName: settings.billingPayeeName || '', upiLink: upiLink(settings, o) };
  }
  return out;
};

exports.overview = async (req, res) => {
  const tenantId = req.scope.tenantId;
  await closeStale(tenantId);
  const [tenant, settings] = await Promise.all([Tenant.findById(tenantId), getSettings()]);
  const [members, branches, packages, open, history, invoices] = await Promise.all([
    Member.countDocuments({ tenantId, isActive: true }),
    Branch.countDocuments({ tenantId, isActive: true }),
    // What can be chosen: the packages on offer, plus the one the gym is already on even if it has since been hidden.
    SubscriptionPackage.find({ $or: [{ isActive: true }, { _id: tenant.packageId || null }] }).sort({ sortOrder: 1, price: 1, createdAt: 1 }).lean(),
    SubscriptionOrder.findOne({ tenantId, status: { $in: OPEN } }).sort({ createdAt: -1 }),
    SubscriptionOrder.find({ tenantId }).sort({ createdAt: -1 }).limit(10),
    TenantSubscriptionInvoice.find({ tenantId, status: 'paid' }).sort({ periodStart: -1 }).limit(12).lean(),
  ]);
  const gst = settings.billingGstPercent || 0;
  res.json({
    subscription: subscriptionOf(tenant),
    usage: { members, branches },
    payment: { enabled: !!settings.billingUpiId, gstPercent: gst },
    packages: packages.map((p) => ({
      _id: p._id, name: p.name, description: p.description, price: p.price, billingMonths: p.billingMonths, maxBranches: p.maxBranches,
      maxMembers: p.maxMembers || null, highlights: p.highlights || [], isFeatured: !!p.isFeatured,
      current: String(p._id) === String(tenant.packageId),
      selectable: p.price > 0, // a free package is arranged with us, not bought here
      maxPeriods: maxPeriods(p),
      quote: p.price > 0 ? quote(p, 1, gst) : null,
    })),
    openOrder: open ? view(open, settings) : null,
    orders: history.map((o) => view(o)),
    invoices,
  });
};

exports.createOrder = async (req, res) => {
  const tenantId = req.scope.tenantId;
  const settings = await getSettings();
  if (!settings.billingUpiId) return res.status(503).json({ message: 'Online upgrades are not set up yet. Please contact us to choose a plan.', code: 'BILLING_NOT_SET_UP' });
  const tenant = await Tenant.findById(tenantId);
  const pkg = await SubscriptionPackage.findById(req.body.packageId);
  if (!pkg || (!pkg.isActive && String(tenant.packageId) !== String(pkg._id))) return res.status(400).json({ message: 'That package is not available.' });
  if (!(pkg.price > 0)) return res.status(400).json({ message: 'This package is arranged with us directly. Please contact us.' });
  const periods = req.body.periods || 1;
  if (periods > maxPeriods(pkg)) return res.status(400).json({ message: `You can buy at most ${maxPeriods(pkg)} periods of this package at once.` });
  const problem = await limitProblem(tenant, pkg);
  if (problem) return res.status(400).json({ message: problem, code: 'OVER_LIMIT' });

  await closeStale(tenantId);
  if (await SubscriptionOrder.exists({ tenantId, status: 'awaiting_confirmation' })) {
    return res.status(409).json({ message: 'Your last payment is still waiting for confirmation. We will email you as soon as it is confirmed.', code: 'PAYMENT_PENDING' });
  }
  // An unpaid earlier choice is simply replaced.
  await SubscriptionOrder.updateMany({ tenantId, status: 'created' }, { $set: { status: 'cancelled' } });

  const q = quote(pkg, periods, settings.billingGstPercent || 0);
  let order;
  for (let attempt = 0; attempt < 5 && !order; attempt++) {
    try {
      order = await SubscriptionOrder.create({
        tenantId, packageId: pkg._id, packageName: pkg.name, kind: kindOf(tenant, pkg), periods, months: q.months,
        amount: q.base, gstPercent: settings.billingGstPercent || 0, gstAmount: q.gst, total: q.total,
        reference: newReference(), expiresAt: new Date(Date.now() + ORDER_HOURS * 3600000), createdBy: req.user._id,
      });
    } catch (err) { if (err.code !== 11000) throw err; } // a reference collision: try another
  }
  if (!order) return res.status(500).json({ message: 'Could not start the payment. Please try again.' });

  // Switching package starts a new period today; say how many days of the current one that gives up.
  const s = subscriptionOf(tenant);
  const losesDays = order.kind === 'change' && s.planEndsAt && !s.planExpired ? s.planDaysLeft : 0;
  logAudit(req, 'CREATE_BILLING_ORDER', { type: 'SubscriptionOrder', id: order._id, metadata: { package: pkg.name, total: order.total } });
  res.status(201).json({ ...view(order, settings), losesDays });
};

const findOwn = (req) => SubscriptionOrder.findOne({ _id: req.params.id, tenantId: req.scope.tenantId });

exports.getOrder = async (req, res) => {
  await closeStale(req.scope.tenantId);
  const order = await findOwn(req);
  if (!order) return res.status(404).json({ message: 'Order not found' });
  res.json(view(order, await getSettings()));
};

exports.cancelOrder = async (req, res) => {
  const order = await SubscriptionOrder.findOneAndUpdate({ _id: req.params.id, tenantId: req.scope.tenantId, status: 'created' }, { $set: { status: 'cancelled' } }, { new: true });
  if (!order) return res.status(409).json({ message: 'This payment can no longer be cancelled.' });
  res.json(view(order));
};

// Everyone on the platform team who should hear that a payment is waiting (scoped admins only for their own gyms).
const notifyStaff = async (tenant, order) => {
  const staff = await User.find({ role: { $in: ['super-admin', 'platform-admin'] }, isActive: true }).select('email managedTenantIds').lean();
  const mine = staff.filter((s) => !(s.managedTenantIds || []).length || s.managedTenantIds.map(String).includes(String(tenant._id)));
  await Promise.all(mine.map((s) => templated({
    to: s.email,
    subject: `Payment to confirm: ${tenant.name}, Rs ${order.total}`,
    heading: 'A gym says it has paid',
    body: `${tenant.name} chose ${order.packageName} and says it paid Rs ${order.total}. Reference ${order.reference}, transaction number ${order.utr}. Check your bank, then confirm it in Payments to confirm.`,
  })));
};

// The owner says "I have paid": the bank's transaction number, and optionally a screenshot of the payment.
exports.submit = async (req, res) => {
  const { utr, image } = req.body;
  const order = await findOwn(req);
  if (!order) return res.status(404).json({ message: 'Order not found' });
  if (order.status !== 'created') return res.status(409).json({ message: order.status === 'awaiting_confirmation' ? 'You already sent the transaction number. We are checking it.' : 'This payment can no longer be submitted. Start a new one.' });
  if (order.expiresAt < new Date()) { order.status = 'expired'; await order.save(); return res.status(409).json({ message: 'This payment request has expired. Start a new one.', code: 'EXPIRED' }); }

  let proofFile;
  if (image) {
    const checked = checkPhoto(image);
    if (checked.message) return res.status(checked.status).json({ message: checked.message });
    proofFile = await storePhoto(PROOF_FOLDER, order._id, checked.buf, checked.type);
  }
  try {
    const claimed = await SubscriptionOrder.findOneAndUpdate(
      { _id: order._id, status: 'created' },
      { $set: { status: 'awaiting_confirmation', utr, utrKey: utr, submittedAt: new Date(), ...(proofFile ? { proofFile } : {}) } },
      { new: true },
    );
    if (!claimed) { await removePhotoFile(PROOF_FOLDER, proofFile); return res.status(409).json({ message: 'You already sent the transaction number.' }); }
    const tenant = await Tenant.findById(order.tenantId).select('name');
    notifyStaff(tenant, claimed).catch(() => {});
    logAudit(req, 'SUBMIT_BILLING_PAYMENT', { type: 'SubscriptionOrder', id: order._id });
    res.json(view(claimed, await getSettings()));
  } catch (err) {
    await removePhotoFile(PROOF_FOLDER, proofFile);
    if (err.code === 11000) return res.status(409).json({ message: 'This transaction number was already used for another payment. Check the number and try again.', code: 'UTR_USED' });
    throw err;
  }
};

exports.getProof = async (req, res) => {
  const order = await findOwn(req);
  if (!order || !order.proofFile) return res.status(404).json({ message: 'No proof' });
  return sendPhoto(res, PROOF_FOLDER, order.proofFile);
};

module.exports.view = view;
module.exports.PROOF_FOLDER = PROOF_FOLDER;
