const ClassSession = require('../models/ClassSession');
const ClassType = require('../models/ClassType');
const Booking = require('../models/Booking');
const Branch = require('../models/Branch');
const { logAudit } = require('../utils/audit');
const { withDerivedSessionStatus, sessionStatusFilter } = require('../utils/classSessionStatus');

// ClassSession has a real trainerId field — unlike Attendance/Booking, the trainer
// role's virtual req.scope.trainerId key needs no translation, it filters directly.
// A trainer's list is therefore automatically restricted to their own sessions, same
// as "My Members" is trainer-scoped for Member.assignedTrainerId.
const scopedFilter = (req) => {
  const filter = { ...req.scope };
  delete filter.memberId;
  return filter;
};

// LOCAL date components, not toISOString() — startAt/endAt below are constructed from
// plain local-time strings (no timezone library, matching every other date field in
// this app), so the loop that walks a date range must stay in local time too. Mixing
// UTC-string slicing with local getDate()/setDate() mutation would silently shift
// every occurrence by a day for any server timezone behind UTC.
const toLocalDateStr = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const findTrainerConflict = (tenantId, trainerId, startAt, endAt, excludeId) => {
  const filter = {
    tenantId, trainerId, status: 'scheduled',
    startAt: { $lt: endAt }, endAt: { $gt: startAt },
  };
  if (excludeId) filter._id = { $ne: excludeId };
  return ClassSession.findOne(filter);
};

exports.list = async (req, res) => {
  const filter = scopedFilter(req);
  const { from, to, trainerId, classTypeId, status } = req.query;
  // Only applied when the caller's own scope doesn't already carry one (i.e. not a
  // trainer, whose scope.trainerId already restricts them to their own sessions) —
  // lets tenant-admin/branch-manager filter down to one trainer's schedule.
  if (!filter.trainerId && trainerId) filter.trainerId = trainerId;
  if (classTypeId) filter.classTypeId = classTypeId;
  if (from || to) {
    filter.startAt = {};
    if (from) filter.startAt.$gte = new Date(from);
    if (to) filter.startAt.$lte = new Date(to);
  }
  if (status) Object.assign(filter, sessionStatusFilter(status));

  const sessions = await ClassSession.find(filter)
    .sort({ startAt: 1 })
    .populate('classTypeId', 'name durationMinutes defaultCapacity')
    .populate('trainerId', 'name');

  // One aggregate for booked/waitlisted counts across the whole result set, so the
  // calendar list doesn't need an N+1 request per session card.
  const ids = sessions.map((s) => s._id);
  const counts = await Booking.aggregate([
    { $match: { classSessionId: { $in: ids } } },
    { $group: { _id: { classSessionId: '$classSessionId', status: '$status' }, count: { $sum: 1 } } },
  ]);
  const countBySession = new Map();
  counts.forEach((c) => {
    const key = c._id.classSessionId.toString();
    if (!countBySession.has(key)) countBySession.set(key, { bookedCount: 0, waitlistedCount: 0 });
    const entry = countBySession.get(key);
    if (c._id.status === 'booked') entry.bookedCount = c.count;
    if (c._id.status === 'waitlisted') entry.waitlistedCount = c.count;
  });

  res.json(sessions.map((s) => ({
    ...withDerivedSessionStatus(s),
    ...(countBySession.get(s._id.toString()) || { bookedCount: 0, waitlistedCount: 0 }),
  })));
};

exports.getOne = async (req, res) => {
  const filter = { ...scopedFilter(req), _id: req.params.id };
  const session = await ClassSession.findOne(filter)
    .populate('classTypeId', 'name durationMinutes defaultCapacity')
    .populate('trainerId', 'name');
  if (!session) return res.status(404).json({ message: 'Class session not found' });
  res.json(withDerivedSessionStatus(session));
};

exports.create = async (req, res) => {
  const { classTypeId, trainerId, startAt, endAt, capacity, notes } = req.body;

  if (!req.body.branchId) return res.status(400).json({ message: 'branchId is required' });
  const branch = await Branch.findOne({ _id: req.body.branchId, tenantId: req.body.tenantId });
  if (!branch) return res.status(400).json({ message: 'Branch not found for this tenant' });

  const classType = await ClassType.findOne({ _id: classTypeId, tenantId: req.body.tenantId });
  if (!classType) return res.status(400).json({ message: 'Class type not found for this tenant' });

  const startAtDate = new Date(startAt);
  const endAtDate = new Date(endAt);
  if (endAtDate <= startAtDate) return res.status(400).json({ message: 'endAt must be after startAt' });

  // A trainer scheduling their own session can't assign it to anyone else —
  // enforceWriteScope only stamps tenantId/branchId, never trainerId, so this override
  // is one explicit line here rather than an extension of that shared middleware.
  const finalTrainerId = req.actorType === 'user' && req.user.role === 'trainer' ? req.user._id : (trainerId || null);

  if (finalTrainerId) {
    const conflict = await findTrainerConflict(req.body.tenantId, finalTrainerId, startAtDate, endAtDate);
    if (conflict) return res.status(409).json({ message: 'Trainer already booked for an overlapping session' });
  }

  const session = await ClassSession.create({
    tenantId: req.body.tenantId, branchId: req.body.branchId, classTypeId: classType._id,
    trainerId: finalTrainerId, startAt: startAtDate, endAt: endAtDate,
    capacity: capacity ?? null, notes,
  });
  logAudit(req, 'CREATE_CLASS_SESSION', { type: 'ClassSession', id: session._id });
  res.status(201).json(session);
};

// Generates one ClassSession per date in [startDate,endDate] whose weekday is in
// daysOfWeek — no RRULE engine, mirrors memberController.bulkCreate's "failures
// isolated per occurrence, not batch-fatal" convention exactly. Conflict checks run
// sequentially (not Promise.all) so a conflict against an occurrence already inserted
// earlier in this same batch is also caught.
exports.batchCreate = async (req, res) => {
  const { classTypeId, trainerId, startDate, endDate, daysOfWeek, startTime, durationMinutes, capacity } = req.body;

  if (!req.body.branchId) return res.status(400).json({ message: 'branchId is required' });
  const branch = await Branch.findOne({ _id: req.body.branchId, tenantId: req.body.tenantId });
  if (!branch) return res.status(400).json({ message: 'Branch not found for this tenant' });

  const classType = await ClassType.findOne({ _id: classTypeId, tenantId: req.body.tenantId });
  if (!classType) return res.status(400).json({ message: 'Class type not found for this tenant' });

  const finalTrainerId = req.actorType === 'user' && req.user.role === 'trainer' ? req.user._id : (trainerId || null);
  const duration = durationMinutes || classType.durationMinutes;

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return res.status(400).json({ message: 'Invalid date range' });
  }

  const created = [];
  const skipped = [];
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (!daysOfWeek.includes(d.getDay())) continue;
    const dateStr = toLocalDateStr(d);
    const startAt = new Date(`${dateStr}T${startTime}:00`);
    const endAt = new Date(startAt.getTime() + duration * 60000);

    if (finalTrainerId) {
      const conflict = await findTrainerConflict(req.body.tenantId, finalTrainerId, startAt, endAt);
      if (conflict) {
        skipped.push({ date: dateStr, reason: 'Trainer already booked for an overlapping session' });
        continue;
      }
    }

    const session = await ClassSession.create({
      tenantId: req.body.tenantId, branchId: req.body.branchId, classTypeId: classType._id,
      trainerId: finalTrainerId, startAt, endAt, capacity: capacity ?? null,
    });
    created.push(session);
  }

  logAudit(req, 'BATCH_CREATE_CLASS_SESSIONS', {
    type: 'ClassType', id: classType._id,
    metadata: { createdCount: created.length, skippedCount: skipped.length },
  });
  res.status(201).json({ created, skipped });
};

exports.update = async (req, res) => {
  const filter = { ...scopedFilter(req), _id: req.params.id };
  const existing = await ClassSession.findOne(filter);
  if (!existing) return res.status(404).json({ message: 'Class session not found' });

  const { trainerId, startAt, endAt, capacity, notes, status } = req.body;
  const newStartAt = startAt ? new Date(startAt) : existing.startAt;
  const newEndAt = endAt ? new Date(endAt) : existing.endAt;
  if (newEndAt <= newStartAt) return res.status(400).json({ message: 'endAt must be after startAt' });

  const newTrainerId = trainerId !== undefined ? (trainerId || null) : existing.trainerId;
  const willBeScheduled = (status || existing.status) === 'scheduled';
  const relevantFieldsChanged = String(newTrainerId) !== String(existing.trainerId)
    || newStartAt.getTime() !== existing.startAt.getTime()
    || newEndAt.getTime() !== existing.endAt.getTime();

  if (newTrainerId && willBeScheduled && relevantFieldsChanged) {
    const conflict = await findTrainerConflict(existing.tenantId, newTrainerId, newStartAt, newEndAt, existing._id);
    if (conflict) return res.status(409).json({ message: 'Trainer already booked for an overlapping session' });
  }

  existing.trainerId = newTrainerId;
  existing.startAt = newStartAt;
  existing.endAt = newEndAt;
  if (capacity !== undefined) existing.capacity = capacity;
  if (notes !== undefined) existing.notes = notes;
  if (status) existing.status = status;
  await existing.save();

  // Two collections must stay consistent without a transaction — the only place that's
  // true in this feature. Cancelling a session must not leave members showing as still
  // booked into a class that no longer runs.
  if (status === 'cancelled') {
    await Booking.updateMany(
      { classSessionId: existing._id, status: { $in: ['booked', 'waitlisted'] } },
      { status: 'cancelled', cancelledAt: new Date() }
    );
  }

  logAudit(req, 'UPDATE_CLASS_SESSION', { type: 'ClassSession', id: existing._id });
  res.json(withDerivedSessionStatus(existing));
};
