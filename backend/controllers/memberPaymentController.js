const Member = require('../models/Member');
const MemberPayment = require('../models/MemberPayment');
const { logAudit } = require('../utils/audit');

const buildFilter = (req) => {
  const filter = { ...req.scope };
  delete filter.trainerId;
  delete filter.memberId;
  return filter;
};

exports.list = async (req, res) => {
  const { page = 1, limit = 20, status, method, from, to, memberId } = req.query;
  const filter = buildFilter(req);
  if (status) filter.status = status;
  if (method) filter.method = method;
  if (memberId) filter.memberId = memberId;
  // Date range is on createdAt, not paidAt: a pending payment has no paidAt, and
  // filtering those out of a date range is exactly backwards for chasing them.
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999); // 'to' is an inclusive day, not a midnight boundary
      filter.createdAt.$lte = end;
    }
  }

  const payments = await MemberPayment.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .populate('memberId', 'name memberCode phone')
    .populate('membershipPlanId', 'name');
  const total = await MemberPayment.countDocuments(filter);
  res.json({ payments, total, page: Number(page), limit: Number(limit) });
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

exports.update = async (req, res) => {
  const { status, gatewayRef } = req.body;

  if (status === 'refunded' && req.features && req.features['features:paymentRefunds'] === false) {
    return res.status(403).json({ message: 'Refunds are not enabled for your gym. Contact support to enable it.' });
  }

  const filter = { ...buildFilter(req), _id: req.params.id };
  const update = { status, gatewayRef };
  if (status === 'paid') update.paidAt = new Date();
  // A refund reverses the collection, so the paid timestamp must go with it — otherwise
  // refunded money keeps counting toward the month's revenue via the paidAt aggregations.
  if (status === 'refunded') update.paidAt = null;
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
