const Booking = require('../models/Booking');
const ClassSession = require('../models/ClassSession');
const ClassType = require('../models/ClassType');
const Member = require('../models/Member');
const { logAudit } = require('../utils/audit');
const { isBookable } = require('../utils/classSessionStatus');

// Booking has no trainerId field (unlike ClassSession) — a trainer's scope.trainerId
// virtual key needs the same two-step translation attendanceController.buildFilter
// uses for Attendance: find their own sessions first, then filter bookings by those.
const buildFilter = async (req) => {
  const filter = { ...req.scope };
  delete filter.memberId;
  if (req.actorType === 'user' && req.user.role === 'trainer') {
    delete filter.trainerId;
    const sessions = await ClassSession.find({ trainerId: req.user._id }).select('_id');
    filter.classSessionId = { $in: sessions.map((s) => s._id) };
  }
  return filter;
};

exports.list = async (req, res) => {
  const filter = await buildFilter(req);
  const { classSessionId, memberId, status } = req.query;
  if (classSessionId) filter.classSessionId = classSessionId;
  if (memberId) filter.memberId = memberId;
  if (status) filter.status = status;
  const bookings = await Booking.find(filter).sort({ bookedAt: -1 }).populate('memberId', 'name memberCode');
  res.json(bookings);
};

exports.create = async (req, res) => {
  const { classSessionId, memberId } = req.body;

  const sessionFilter = { _id: classSessionId, tenantId: req.scope.tenantId };
  if (req.scope.branchId) sessionFilter.branchId = req.scope.branchId;
  const session = await ClassSession.findOne(sessionFilter);
  if (!session) return res.status(404).json({ message: 'Class session not found' });

  // A trainer books members only into their own sessions — same "my schedule, my
  // bookings" boundary as the session-update restriction, and the same 404-not-403
  // convention this codebase uses for cross-ownership access everywhere else.
  if (req.actorType === 'user' && req.user.role === 'trainer' && String(session.trainerId) !== String(req.user._id)) {
    return res.status(404).json({ message: 'Class session not found' });
  }

  if (!isBookable(session)) return res.status(400).json({ message: 'This session is not open for booking' });

  const member = await Member.findOne({ _id: memberId, tenantId: session.tenantId, branchId: session.branchId, isActive: true });
  if (!member) return res.status(400).json({ message: "Member not found in this session's branch" });

  const classType = await ClassType.findById(session.classTypeId).select('defaultCapacity');
  const effectiveCapacity = session.capacity ?? classType.defaultCapacity;
  // Known race: two staff booking the last slot at once could both pass this count
  // check before either write lands, slightly overshooting capacity by one. No
  // transaction/locking primitive is used anywhere else in this codebase, so this
  // accepts the same low-concurrency tolerance as the rest of the app — a reception
  // action, not a flash-sale checkout.
  const bookedCount = await Booking.countDocuments({ classSessionId: session._id, status: 'booked' });
  const status = bookedCount < effectiveCapacity ? 'booked' : 'waitlisted';

  let booking;
  try {
    booking = await Booking.create({
      tenantId: session.tenantId, branchId: session.branchId,
      classSessionId: session._id, memberId: member._id,
      status, bookedBy: req.user._id,
    });
  } catch (err) {
    // The partial unique index (memberId+classSessionId, status != cancelled) is what
    // catches a duplicate active booking — surface it as a clean 409, not a raw 500.
    if (err.code === 11000) return res.status(409).json({ message: 'This member already has an active booking for this session' });
    throw err;
  }

  logAudit(req, 'CREATE_BOOKING', { type: 'Booking', id: booking._id, metadata: { status } });
  res.status(201).json(booking);
};

exports.cancel = async (req, res) => {
  const filter = await buildFilter(req);
  filter._id = req.params.id;
  const booking = await Booking.findOne(filter);
  if (!booking) return res.status(404).json({ message: 'Booking not found' });
  if (booking.status === 'cancelled') return res.status(400).json({ message: 'Booking is already cancelled' });

  const wasBooked = booking.status === 'booked';
  booking.status = 'cancelled';
  booking.cancelledAt = new Date();
  await booking.save();

  // Promotion only when a BOOKED slot was actually freed — cancelling an already
  // waitlisted booking doesn't open anything up. Automatic (not a manual "promote"
  // button) since it's symmetric with automatic overflow-waitlisting on create.
  if (wasBooked) {
    const nextWaitlisted = await Booking.findOne({ classSessionId: booking.classSessionId, status: 'waitlisted' }).sort({ bookedAt: 1 });
    if (nextWaitlisted) {
      nextWaitlisted.status = 'booked';
      await nextWaitlisted.save();
      logAudit(req, 'PROMOTE_BOOKING', { type: 'Booking', id: nextWaitlisted._id });
    }
  }

  logAudit(req, 'CANCEL_BOOKING', { type: 'Booking', id: booking._id });
  res.json(booking);
};

// A waitlisted or already-cancelled booking has no attended/no-show state to set —
// only a booked member can actually show up or not.
const markStatus = (newStatus, action) => async (req, res) => {
  const filter = await buildFilter(req);
  filter._id = req.params.id;
  const booking = await Booking.findOne(filter);
  if (!booking) return res.status(404).json({ message: 'Booking not found' });
  if (booking.status !== 'booked') {
    return res.status(400).json({ message: `Only a booked booking can be marked ${newStatus}` });
  }
  booking.status = newStatus;
  booking.markedBy = req.user._id;
  booking.markedAt = new Date();
  await booking.save();
  logAudit(req, action, { type: 'Booking', id: booking._id });
  res.json(booking);
};

exports.markAttended = markStatus('attended', 'MARK_BOOKING_ATTENDED');
exports.markNoShow = markStatus('no-show', 'MARK_BOOKING_NO_SHOW');
