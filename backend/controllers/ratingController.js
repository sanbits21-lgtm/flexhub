const mongoose = require('mongoose');
const { z } = require('zod');
const Rating = require('../models/Rating');
const User = require('../models/User');
const Branch = require('../models/Branch');
const Attendance = require('../models/Attendance');
const PtSession = require('../models/PtSession');

// Ratings of the gym and of its trainers.
//   * Members see their OWN ratings, and the gym's average once enough members have rated (so a
//     score never exposes one person's opinion).
//   * A trainer's score is never shown to members. Owners and branch managers see it, with the
//     words, but not who wrote them.
//   * Not shown to trainers either, for now: how a team reads its own scores is the manager's call.

// Below this many ratings the gym average is hidden from members.
const MIN_PUBLIC = 5;

const body = z.object({
  stars: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
}).strict();

const badRequest = (res, parsed) => res.status(400).json({
  message: parsed.error.issues.map((i) => `${i.path.join('.') || 'rating'} ${i.message}`).join('; '),
});

const mine = (r) => (r ? { stars: r.stars, comment: r.comment || '', updatedAt: r.updatedAt } : null);

// ---------- what a member sees and does ----------

const eligibility = async (member) => {
  const visited = (await Attendance.countDocuments({ memberId: member._id })) > 0;
  const trained = await PtSession.distinct('trainerId', { memberId: member._id, status: { $in: ['completed', 'scheduled'] }, startAt: { $lte: new Date() } });
  const trainerIds = new Set(trained.map(String));
  if (member.assignedTrainerId) trainerIds.add(String(member.assignedTrainerId));
  return { visited, trainerIds };
};

exports.overview = async (req, res) => {
  const m = req.member;
  const [own, gymAgg, trainers, elig] = await Promise.all([
    Rating.find({ memberId: m._id }).lean(),
    Rating.aggregate([
      { $match: { tenantId: m.tenantId, branchId: m.branchId, targetType: 'gym' } },
      { $group: { _id: null, average: { $avg: '$stars' }, count: { $sum: 1 } } },
    ]),
    User.find({ tenantId: m.tenantId, branchId: m.branchId, role: 'trainer', isActive: true }).select('name specialization').sort({ name: 1 }).lean(),
    eligibility(m),
  ]);
  const agg = gymAgg[0] || { average: 0, count: 0 };
  const isPublic = agg.count >= MIN_PUBLIC;
  res.json({
    minPublic: MIN_PUBLIC,
    gym: {
      mine: mine(own.find((r) => r.targetType === 'gym')),
      canRate: elig.visited,
      average: isPublic ? Math.round(agg.average * 10) / 10 : null,
      count: isPublic ? agg.count : null,
    },
    trainers: trainers.map((t) => ({
      _id: t._id,
      name: t.name,
      specialization: t.specialization || '',
      canRate: elig.trainerIds.has(String(t._id)),
      mine: mine(own.find((r) => r.targetType === 'trainer' && String(r.trainerId) === String(t._id))),
    })),
  });
};

const save = (member, targetType, trainerId, data) => Rating.findOneAndUpdate(
  { memberId: member._id, targetType, trainerId },
  { $set: { stars: data.stars, comment: data.comment || '', tenantId: member.tenantId, branchId: member.branchId } },
  { upsert: true, new: true, setDefaultsOnInsert: true },
);

exports.rateGym = async (req, res) => {
  const parsed = body.safeParse(req.body || {});
  if (!parsed.success) return badRequest(res, parsed);
  if (!(await eligibility(req.member)).visited) return res.status(403).json({ message: 'You can rate the gym after your first visit.' });
  res.json(mine(await save(req.member, 'gym', null, parsed.data)));
};

exports.rateTrainer = async (req, res) => {
  const parsed = body.safeParse(req.body || {});
  if (!parsed.success) return badRequest(res, parsed);
  const { trainerId } = req.params;
  if (!mongoose.isValidObjectId(trainerId)) return res.status(404).json({ message: 'Trainer not found' });
  const trainer = await User.findOne({ _id: trainerId, tenantId: req.member.tenantId, branchId: req.member.branchId, role: 'trainer', isActive: true }).select('_id');
  if (!trainer) return res.status(404).json({ message: 'Trainer not found' });
  if (!(await eligibility(req.member)).trainerIds.has(String(trainer._id))) {
    return res.status(403).json({ message: 'You can rate a trainer who is assigned to you or has trained you.' });
  }
  res.json(mine(await save(req.member, 'trainer', trainer._id, parsed.data)));
};

exports.withdrawGym = async (req, res) => {
  await Rating.deleteOne({ memberId: req.member._id, targetType: 'gym', trainerId: null });
  res.json({ ok: true });
};

exports.withdrawTrainer = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.trainerId)) return res.status(404).json({ message: 'Trainer not found' });
  await Rating.deleteOne({ memberId: req.member._id, targetType: 'trainer', trainerId: req.params.trainerId });
  res.json({ ok: true });
};

// ---------- what an owner or branch manager sees ----------

const oid = (v) => new mongoose.Types.ObjectId(String(v));

const tally = (rows) => {
  const distribution = [0, 0, 0, 0, 0];
  rows.forEach((r) => { distribution[r.stars - 1] += 1; });
  const count = rows.length;
  return {
    count,
    average: count ? Math.round((rows.reduce((s, r) => s + r.stars, 0) / count) * 10) / 10 : null,
    distribution,
    // The newest words, without the author: nothing here says who wrote it.
    recent: rows.filter((r) => r.comment).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 10)
      .map((r) => ({ stars: r.stars, comment: r.comment, at: r.updatedAt })),
  };
};

exports.staffOverview = async (req, res) => {
  const { tenantId, branchId } = req.scope; // a branch manager is already pinned to one branch
  if (branchId && !mongoose.isValidObjectId(branchId)) return res.status(400).json({ message: 'Invalid branch' });
  const onlyBranch = branchId ? oid(branchId) : null;
  const filter = { tenantId: oid(tenantId), ...(onlyBranch ? { branchId: onlyBranch } : {}) };

  const [ratings, branches, trainers] = await Promise.all([
    Rating.find(filter).select('targetType trainerId branchId stars comment updatedAt').lean(),
    Branch.find({ tenantId: oid(tenantId), ...(onlyBranch ? { _id: onlyBranch } : {}) }).select('name').sort({ name: 1 }).lean(),
    User.find({ tenantId: oid(tenantId), role: 'trainer', isActive: true, ...(onlyBranch ? { branchId: onlyBranch } : {}) }).select('name specialization branchId').sort({ name: 1 }).lean(),
  ]);
  const branchName = new Map(branches.map((b) => [String(b._id), b.name]));

  res.json({
    minPublic: MIN_PUBLIC,
    gym: branches.map((b) => ({
      branchId: b._id,
      branchName: b.name,
      ...tally(ratings.filter((r) => r.targetType === 'gym' && String(r.branchId) === String(b._id))),
    })),
    trainers: trainers.map((t) => ({
      trainerId: t._id,
      name: t.name,
      specialization: t.specialization || '',
      branchId: t.branchId,
      branchName: branchName.get(String(t.branchId)) || '',
      ...tally(ratings.filter((r) => r.targetType === 'trainer' && String(r.trainerId) === String(t._id))),
    })),
  });
};
