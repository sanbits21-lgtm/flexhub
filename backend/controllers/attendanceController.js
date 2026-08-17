const Member = require('../models/Member');
const Attendance = require('../models/Attendance');

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
  const { page = 1, limit = 20 } = req.query;
  const filter = await buildFilter(req);
  const records = await Attendance.find(filter)
    .sort({ checkInAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit))
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

// Member checks themselves in via QR (mobile app), or branch-manager records manually.
exports.checkIn = async (req, res) => {
  let tenantId, branchId, memberId, method, recordedBy;

  if (req.actorType === 'member') {
    ({ tenantId, branchId, _id: memberId } = req.member);
    method = 'qr';
  } else {
    tenantId = req.scope.tenantId;
    branchId = req.scope.branchId;
    // A tenant-admin's scope only carries a branchId when they've drilled into one
    // branch; without this the create below would fail on the required branchId.
    if (!branchId) return res.status(400).json({ message: 'Select a branch before recording attendance' });
    memberId = req.body.memberId;
    method = 'manual';
    recordedBy = req.user._id;
    const member = await Member.findOne({ _id: memberId, tenantId, branchId });
    if (!member) return res.status(404).json({ message: 'Member not found in your branch' });
  }

  const record = await Attendance.create({ tenantId, branchId, memberId, method, recordedBy });
  res.status(201).json(record);
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
