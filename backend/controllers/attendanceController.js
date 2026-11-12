const jwt = require('jsonwebtoken');
const Member = require('../models/Member');
const Attendance = require('../models/Attendance');
const { deriveMembershipStatus } = require('../utils/membershipStatus');
const { logAudit } = require('../utils/audit');
const { pageParams } = require('../utils/paginate');

// Builds the Mongo filter for the caller's scope. For a trainer, the virtual `trainerId`
// scope key isn't a real field on anything — it's translated into an actual member-ID
// lookup via Member.assignedTrainerId (the real relationship; User.assignedMembers is
// never populated by anything and must not be used).
const buildFilter = async (req) => {
  const filter = { ...req.scope };
  delete filter.memberId;
  if (req.actorType === 'user' && req.user.role === 'trainer') {
    delete filter.trainerId;
    const assigned = await Member.find({ assignedTrainerId: req.user._id }).select('_id');
    filter.memberId = { $in: assigned.map((m) => m._id) };
  }
  return filter;
};

exports.list = async (req, res) => {
  const { page, limit } = pageParams(req);
  const filter = await buildFilter(req);
  const records = await Attendance.find(filter)
    .sort({ checkInAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate('memberId', 'name memberCode');
  res.json(records);
};

exports.getForMember = async (req, res) => {
  // A member calling this may only ever see their own history, regardless of what id
  // they pass — previously any member could read another same-branch member's attendance
  // by guessing their id, since branchId alone doesn't uniquely identify one member.
  if (req.actorType === 'member' && req.params.id !== req.member._id.toString()) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const filter = { ...(await buildFilter(req)), memberId: req.params.id };
  const records = await Attendance.find(filter).sort({ checkInAt: -1 }).limit(100);
  res.json(records);
};

// A check-in older than this with no check-out is treated as forgotten, not as "still inside".
const OPEN_WINDOW_MS = 12 * 60 * 60 * 1000;

const findOpenRecord = (memberId) => Attendance.findOne({
  memberId, checkOutAt: null, checkInAt: { $gte: new Date(Date.now() - OPEN_WINDOW_MS) },
});

// Who may walk in. A tenant can turn the membership checks off (a grace-period gym) with the
// rules:blockExpiredCheckIn flag; a deactivated member is never let in.
const whyNotAllowed = (member, features) => {
  if (!member.isActive) return 'This member is deactivated.';
  if (features && features['rules:blockExpiredCheckIn'] === false) return null;
  if (!member.membershipPlanId) return 'This member has no plan yet. Add a plan first.';
  const status = deriveMembershipStatus(member);
  if (status === 'expired') return `Membership ended on ${new Date(member.membershipEnd).toLocaleDateString('en-IN')}. Renew to check in.`;
  if (status === 'frozen') return 'This membership is frozen.';
  if (status === 'cancelled') return 'This membership is cancelled.';
  return null;
};

const describeMember = (m) => ({ _id: m._id, name: m.name, memberCode: m.memberCode, membershipStatus: deriveMembershipStatus(m), membershipEnd: m.membershipEnd });

// Staff record a check-in. Members cannot check themselves in any more: with no proof they
// are physically at the gym, anyone could check in from anywhere. (See /scan for the QR flow.)
exports.checkIn = async (req, res) => {
  if (req.actorType === 'member') {
    return res.status(403).json({ message: 'Show your pass at the front desk to check in.' });
  }
  const { tenantId, branchId } = req.scope;
  // A tenant-admin's scope only carries a branchId when they've drilled into one
  // branch; without this the create below would fail on the required branchId.
  if (!branchId) return res.status(400).json({ message: 'Select a branch before recording attendance' });
  const member = await Member.findOne({ _id: req.body.memberId, tenantId, branchId });
  if (!member) return res.status(404).json({ message: 'Member not found in your branch' });

  const blocked = whyNotAllowed(member, req.features);
  if (blocked) return res.status(400).json({ message: blocked });
  const open = await findOpenRecord(member._id);
  if (open) return res.status(409).json({ message: `${member.name} is already checked in.`, attendanceId: open._id });

  const record = await Attendance.create({ tenantId, branchId, memberId: member._id, method: 'manual', recordedBy: req.user._id });
  res.status(201).json(record);
};

// The QR flow. The member's app shows a short-lived signed pass (GET /member-app/pass); the front
// desk scans it. Scanning someone who is inside checks them out, so one gesture does both.
exports.scan = async (req, res) => {
  const { token } = req.body || {};
  if (typeof token !== 'string' || token.length > 1000) return res.status(400).json({ message: 'That is not a FitzyClub pass.' });
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(400).json({ message: err.name === 'TokenExpiredError' ? 'This pass has expired. Ask the member to refresh it.' : 'That is not a valid FitzyClub pass.' });
  }
  if (decoded.purpose !== 'checkin' || !decoded.sub) return res.status(400).json({ message: 'That is not a valid FitzyClub pass.' });

  const filter = { _id: decoded.sub, tenantId: req.scope.tenantId };
  if (req.scope.branchId) filter.branchId = req.scope.branchId;
  const member = await Member.findOne(filter);
  if (!member) return res.status(404).json({ message: 'This member does not belong to your gym.' });

  const open = await findOpenRecord(member._id);
  if (open) {
    open.checkOutAt = new Date();
    await open.save();
    return res.json({ action: 'checked-out', member: describeMember(member), record: open });
  }
  const blocked = whyNotAllowed(member, req.features);
  if (blocked) return res.status(400).json({ message: blocked, member: describeMember(member) });

  const record = await Attendance.create({ tenantId: member.tenantId, branchId: member.branchId, memberId: member._id, method: 'qr', recordedBy: req.user._id });
  logAudit(req, 'SCAN_CHECK_IN', { type: 'Member', id: member._id });
  res.status(201).json({ action: 'checked-in', member: describeMember(member), record });
};

exports.checkOut = async (req, res) => {
  const filter = { ...(await buildFilter(req)), _id: req.body.attendanceId, checkOutAt: null };
  // buildFilter drops the member's own memberId from the scope, so without this a member
  // could check out any open record in their branch by guessing the attendance id.
  if (req.actorType === 'member') filter.memberId = req.member._id;
  const record = await Attendance.findOneAndUpdate(filter, { checkOutAt: new Date() }, { new: true });
  if (!record) return res.status(404).json({ message: 'Open attendance record not found' });
  res.json(record);
};
