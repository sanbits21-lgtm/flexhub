const { z } = require('zod');
const PtSession = require('../models/PtSession');
const ClassSession = require('../models/ClassSession');
const Member = require('../models/Member');
const User = require('../models/User');
const { logAudit } = require('../utils/audit');
const q = require('../utils/query');

const MAX_MINUTES = 4 * 60;

const idField = z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a valid id');
const dateField = z.coerce.date();

const createSchema = z.object({
  memberId: idField,
  trainerId: idField.optional(), // only honoured for branch-manager / tenant-admin
  startAt: dateField,
  endAt: dateField,
  focus: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
});
const updateSchema = z.object({
  startAt: dateField.optional(),
  endAt: dateField.optional(),
  focus: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
}).strict();

const bad = (res, parsed) => {
  const errors = parsed.error.issues.map((i) => ({ field: i.path.join('.') || '(body)', message: i.message }));
  return res.status(400).json({ message: `Invalid request: ${errors.map((e) => `${e.field} ${e.message}`).join('; ')}`, errors });
};

const isTrainer = (req) => req.actorType === 'user' && req.user.role === 'trainer';

// PtSession has a real trainerId field, so the trainer role's scope key filters it
// directly: a trainer only ever sees their own sessions. memberId is the member-actor
// key and does not apply to staff.
const scoped = (req) => {
  const filter = { ...req.scope };
  delete filter.memberId;
  return filter;
};

// A trainer cannot be in two places: clash with another PT session OR a scheduled class.
const trainerBusy = async (tenantId, trainerId, startAt, endAt, excludeId) => {
  const overlap = { startAt: { $lt: endAt }, endAt: { $gt: startAt } };
  const pt = await PtSession.findOne({ tenantId, trainerId, status: 'scheduled', ...overlap, ...(excludeId ? { _id: { $ne: excludeId } } : {}) });
  if (pt) return 'You already have a training session at that time';
  const cls = await ClassSession.findOne({ tenantId, trainerId, status: 'scheduled', ...overlap });
  if (cls) return 'You already have a class at that time';
  return null;
};
const memberBusy = async (tenantId, memberId, startAt, endAt, excludeId) => {
  const pt = await PtSession.findOne({
    tenantId, memberId, status: 'scheduled', startAt: { $lt: endAt }, endAt: { $gt: startAt }, ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  });
  return pt ? 'This member already has a training session at that time' : null;
};

const checkTimes = (startAt, endAt, { allowPast = false } = {}) => {
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) return 'Invalid date or time';
  if (endAt <= startAt) return 'End time must be after the start time';
  if (endAt - startAt > MAX_MINUTES * 60000) return 'A session can be at most 4 hours long';
  if (!allowPast && startAt.getTime() < Date.now() - 5 * 60000) return 'Start time is in the past';
  return null;
};

const populate = (q) => q.populate('memberId', 'name memberCode phone').populate('trainerId', 'name');

exports.list = async (req, res) => {
  const filter = scoped(req);
  const trainerId = q.oid(req.query.trainerId, 'trainerId');
  const memberId = q.oid(req.query.memberId, 'memberId');
  const status = q.oneOf(req.query.status, ['scheduled', 'completed', 'no-show', 'cancelled'], 'status');
  const from = q.date(req.query.from, 'from');
  const to = q.date(req.query.to, 'to');
  if (!filter.trainerId && trainerId) filter.trainerId = trainerId;
  if (memberId) filter.memberId = memberId;
  if (status) filter.status = status;
  if (from || to) {
    filter.startAt = {};
    if (from) filter.startAt.$gte = from;
    if (to) filter.startAt.$lte = to;
  }
  res.json(await populate(PtSession.find(filter).sort({ startAt: 1 }).limit(300)));
};

exports.create = async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const { memberId, startAt, endAt, focus, notes } = parsed.data;
  const timeError = checkTimes(startAt, endAt);
  if (timeError) return res.status(400).json({ message: timeError });

  const tenantId = req.scope.tenantId;
  // Member: a trainer may only schedule their assigned members; a manager any member of
  // their branch; a tenant admin any member of the gym.
  const memberFilter = { _id: memberId, tenantId, isActive: true };
  if (req.scope.branchId) memberFilter.branchId = req.scope.branchId;
  if (isTrainer(req)) memberFilter.assignedTrainerId = req.user._id;
  const member = await Member.findOne(memberFilter).select('_id branchId tenantId');
  if (!member) return res.status(404).json({ message: 'Member not found' });

  let trainerId = req.user._id;
  if (!isTrainer(req)) {
    if (!parsed.data.trainerId) return res.status(400).json({ message: 'trainerId is required' });
    const trainer = await User.findOne({ _id: parsed.data.trainerId, tenantId, branchId: member.branchId, role: 'trainer', isActive: true }).select('_id');
    if (!trainer) return res.status(400).json({ message: 'Trainer not found in this member\'s branch' });
    trainerId = trainer._id;
  }

  const busy = (await trainerBusy(tenantId, trainerId, startAt, endAt)) || (await memberBusy(tenantId, member._id, startAt, endAt));
  if (busy) return res.status(409).json({ message: busy });

  const session = await PtSession.create({
    tenantId, branchId: member.branchId, trainerId, memberId: member._id, startAt, endAt, focus, notes, createdBy: req.user._id,
  });
  logAudit(req, 'CREATE_PT_SESSION', { type: 'PtSession', id: session._id });
  res.status(201).json(await populate(PtSession.findById(session._id)));
};

const findOwn = (req) => PtSession.findOne({ ...scoped(req), _id: req.params.id });

exports.update = async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed);
  const session = await findOwn(req);
  if (!session) return res.status(404).json({ message: 'Session not found' });
  if (session.status !== 'scheduled') return res.status(400).json({ message: `A ${session.status} session cannot be changed` });

  const startAt = parsed.data.startAt || session.startAt;
  const endAt = parsed.data.endAt || session.endAt;
  if (parsed.data.startAt || parsed.data.endAt) {
    const timeError = checkTimes(startAt, endAt);
    if (timeError) return res.status(400).json({ message: timeError });
    const busy = (await trainerBusy(session.tenantId, session.trainerId, startAt, endAt, session._id))
      || (await memberBusy(session.tenantId, session.memberId, startAt, endAt, session._id));
    if (busy) return res.status(409).json({ message: busy });
  }
  Object.assign(session, { startAt, endAt }, ...['focus', 'notes'].filter((k) => parsed.data[k] !== undefined).map((k) => ({ [k]: parsed.data[k] })));
  await session.save();
  logAudit(req, 'UPDATE_PT_SESSION', { type: 'PtSession', id: session._id });
  res.json(await populate(PtSession.findById(session._id)));
};

// Outcome transitions. Only a scheduled session can move, and completed / no-show need
// the start time to have passed (you cannot mark a future session as done).
const transition = (to, action) => async (req, res) => {
  const session = await findOwn(req);
  if (!session) return res.status(404).json({ message: 'Session not found' });
  if (session.status !== 'scheduled') return res.status(400).json({ message: `This session is already ${session.status}` });
  if ((to === 'completed' || to === 'no-show') && session.startAt.getTime() > Date.now()) {
    return res.status(400).json({ message: 'This session has not started yet' });
  }
  session.status = to;
  if (to === 'cancelled') {
    session.cancelledAt = new Date();
    session.cancelledBy = isTrainer(req) ? 'trainer' : 'staff';
  }
  await session.save();
  logAudit(req, action, { type: 'PtSession', id: session._id });
  res.json(await populate(PtSession.findById(session._id)));
};
exports.cancel = transition('cancelled', 'CANCEL_PT_SESSION');
exports.complete = transition('completed', 'COMPLETE_PT_SESSION');
exports.noShow = transition('no-show', 'NO_SHOW_PT_SESSION');
