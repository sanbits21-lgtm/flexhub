const mongoose = require('mongoose');
const Member = require('../models/Member');
const MemberPayment = require('../models/MemberPayment');
const { logAudit } = require('../utils/audit');
const q = require('../utils/query');
const { pageParams } = require('../utils/paginate');

// Aggregation does not cast ids the way find() does, so string ids are converted here.
const toObjectIds = (filter) => {
  const out = { ...filter };
  ['tenantId', 'branchId', 'memberId'].forEach((k) => {
    if (typeof out[k] === 'string' && mongoose.isValidObjectId(out[k])) out[k] = new mongoose.Types.ObjectId(out[k]);
  });
  return out;
};

const SUMMARY_STATUSES = ['paid', 'pending', 'refunded', 'failed'];

const buildFilter = (req) => {
  const filter = { ...req.scope };
  delete filter.trainerId;
  delete filter.memberId;
  return filter;
};

exports.list = async (req, res) => {
  const { page, limit } = pageParams(req);
  const status = q.oneOf(req.query.status, ['pending', 'paid', 'failed', 'refunded'], 'status');
  const method = q.oneOf(req.query.method, ['cash', 'card', 'upi', 'netbanking', 'other'], 'method');
  const memberId = q.oid(req.query.memberId, 'memberId');
  const from = q.date(req.query.from, 'from');
  const to = q.date(req.query.to, 'to');
  const search = q.str(req.query.search, 'search', 60);
  const filter = buildFilter(req);
  if (status) filter.status = status;
  // By invoice number or by the member's name (members are looked up inside this gym only).
  if (search) {
    const rx = new RegExp(q.escapeRegex(search), 'i');
    const memberScope = { tenantId: filter.tenantId };
    if (filter.branchId) memberScope.branchId = filter.branchId;
    const ids = await Member.find({ ...memberScope, name: rx }).select('_id').limit(200).lean();
    filter.$or = [{ invoiceNumber: rx }, { memberId: { $in: ids.map((m) => m._id) } }];
  }
  if (method) filter.method = method;
  if (memberId) filter.memberId = memberId;
  // Date range is on createdAt, not paidAt: a pending payment has no paidAt, and
  // filtering those out of a date range is exactly backwards for chasing them.
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999); // 'to' is an inclusive day, not a midnight boundary
      filter.createdAt.$lte = end;
    }
  }

  const payments = await MemberPayment.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate('memberId', 'name memberCode phone')
    .populate('membershipPlanId', 'name');
  const total = await MemberPayment.countDocuments(filter);

  // Money totals over EVERYTHING the search and filters match, not just this page, so the figure
  // on screen is what the filters describe. Only the amount of paid payments is "collected".
  const byStatus = await MemberPayment.aggregate([
    { $match: toObjectIds(filter) },
    { $group: { _id: '$status', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
  ]);
  const summary = Object.fromEntries(SUMMARY_STATUSES.map((s) => {
    const row = byStatus.find((r) => r._id === s);
    return [s, { amount: row?.amount || 0, count: row?.count || 0 }];
  }));
  res.json({ payments, total, page, limit, summary });
};

exports.getForMember = async (req, res) => {
  const filter = { ...buildFilter(req), memberId: req.params.id };
  const payments = await MemberPayment.find(filter).sort({ createdAt: -1 }).limit(100);
  res.json(payments);
};

// Branch-manager records a payment for a member in their own branch; tenant-admin
// (not locked to one branch) may record one for any member in their tenant — the
// payment's branch is taken from the member's own record, not req.scope.branchId,
// since a tenant-admin's scope only carries a branchId when drilled into one branch.
exports.create = async (req, res) => {
  const { memberId, membershipPlanId, amount, method, status, gatewayRef } = req.body;

  if (method === 'upi' && req.features && req.features['features:upiPayments'] === false) {
    return res.status(403).json({ message: 'UPI payment collection is not enabled for your gym. Contact support to enable it.' });
  }

  const memberFilter = { _id: memberId, tenantId: req.scope.tenantId };
  if (req.scope.branchId) memberFilter.branchId = req.scope.branchId;
  const member = await Member.findOne(memberFilter);
  if (!member) return res.status(404).json({ message: 'Member not found' });
  if (!member.isActive) return res.status(400).json({ message: 'This member is deactivated. Reactivate them before recording a payment.' });

  const paidStatus = status || 'paid';
  const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;

  const payment = await MemberPayment.create({
    tenantId: req.scope.tenantId,
    branchId: member.branchId,
    memberId,
    membershipPlanId: membershipPlanId || member.membershipPlanId,
    amount,
    method,
    status: paidStatus,
    gatewayRef,
    invoiceNumber,
    paidAt: paidStatus === 'paid' ? new Date() : undefined,
  });
  logAudit(req, 'CREATE_PAYMENT', { type: 'MemberPayment', id: payment._id });
  res.status(201).json(payment);
};

// Money moves one way. Without this a refunded payment could be flipped back to "paid" (or a
// paid one back to "pending"), which silently rewrites revenue.
const TRANSITIONS = {
  pending: ['paid', 'failed'],
  failed: ['pending', 'paid'],
  paid: ['refunded'],
  refunded: [],
};

exports.update = async (req, res) => {
  const { status, gatewayRef } = req.body;

  if (status === 'refunded' && req.features && req.features['features:paymentRefunds'] === false) {
    return res.status(403).json({ message: 'Refunds are not enabled for your gym. Contact support to enable it.' });
  }

  const filter = { ...buildFilter(req), _id: req.params.id };
  const current = await MemberPayment.findOne(filter);
  if (!current) return res.status(404).json({ message: 'Payment not found' });

  const changing = status !== undefined && status !== current.status;
  if (changing && !TRANSITIONS[current.status].includes(status)) {
    return res.status(400).json({
      message: current.status === 'refunded'
        ? 'A refunded payment cannot be changed.'
        : `A ${current.status} payment cannot be changed to ${status}.`,
    });
  }
  const update = {};
  if (gatewayRef !== undefined) update.gatewayRef = gatewayRef;
  if (changing) {
    update.status = status;
    if (status === 'paid') update.paidAt = new Date();
    // A refund reverses the collection, so the paid timestamp must go with it — otherwise
    // refunded money keeps counting toward the month's revenue via the paidAt aggregations.
    if (status === 'refunded') update.paidAt = null;
  }
  const payment = await MemberPayment.findOneAndUpdate(filter, update, { new: true })
    .populate('memberId', 'name memberCode phone')
    .populate('membershipPlanId', 'name');
  if (!payment) return res.status(404).json({ message: 'Payment not found' });
  logAudit(req, status === 'refunded' ? 'REFUND_PAYMENT' : 'UPDATE_PAYMENT', {
    type: 'MemberPayment',
    id: payment._id,
    metadata: { status, amount: payment.amount },
  });
  res.json(payment);
};
