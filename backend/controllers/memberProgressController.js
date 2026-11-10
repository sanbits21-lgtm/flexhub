const { z } = require('zod');
const Member = require('../models/Member');
const Attendance = require('../models/Attendance');
const { computeAchievements, summarize } = require('../utils/achievements');
const { logAudit } = require('../utils/audit');

// The member's own body-change history, badges and streaks. Private: nothing here is shown to any
// other member. (Trainers and managers already read the same measurements on the staff side.)

const MAX_ENTRIES = 500;
const SHOWN = 200;

const num = (min, max) => z.preprocess((v) => (v === '' || v === null ? undefined : v), z.coerce.number().min(min).max(max).optional());

const entrySchema = z.object({
  weightKg: num(20, 400),
  bodyFatPct: num(3, 60),
  notes: z.string().trim().max(200).optional(),
  date: z.preprocess((v) => (v === '' || v === null ? undefined : v), z.coerce.date().optional()),
}).strict().superRefine((v, ctx) => {
  if (v.weightKg === undefined && v.bodyFatPct === undefined) ctx.addIssue({ code: 'custom', message: 'Enter your weight or your body fat.' });
  if (v.date) {
    const now = Date.now();
    if (v.date.getTime() > now + 86400000) ctx.addIssue({ code: 'custom', path: ['date'], message: 'cannot be in the future' });
    if (v.date.getTime() < now - 2 * 365 * 86400000) ctx.addIssue({ code: 'custom', path: ['date'], message: 'is more than two years ago' });
  }
});

// What the screen needs: the history (oldest first, for the chart), the change since the start,
// the badges, and the visit counters.
const build = async (memberId) => {
  const member = await Member.findById(memberId).select('bodyMetrics fitnessGoal membershipStart createdAt');
  const metrics = [...(member.bodyMetrics || [])]
    .map((m) => ({
      _id: m._id, date: m.date, weightKg: m.weightKg, heightCm: m.heightCm, bodyFatPct: m.bodyFatPct, notes: m.notes || '', source: m.source || 'staff',
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  // A height-only entry (from the profile form) says nothing about progress.
  const measured = metrics.filter((m) => Number.isFinite(m.weightKg) || Number.isFinite(m.bodyFatPct));

  const visits = await Attendance.find({ memberId }).select('checkInAt').sort({ checkInAt: 1 }).limit(5000).lean();
  const { achievements, stats } = computeAchievements({
    visitDates: visits.map((v) => v.checkInAt),
    metrics: measured,
    goal: member.fitnessGoal || null,
    joinedAt: member.membershipStart || member.createdAt,
  });
  return {
    goal: member.fitnessGoal || null,
    metrics: measured.slice(-SHOWN),
    summary: summarize(metrics),
    stats,
    achievements,
  };
};

exports.get = async (req, res) => res.json(await build(req.member._id));

exports.add = async (req, res) => {
  const parsed = entrySchema.safeParse(req.body || {});
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => ({ field: i.path.join('.') || '(body)', message: i.message }));
    return res.status(400).json({ message: errors.map((e) => (e.field === '(body)' ? e.message : `${e.field} ${e.message}`)).join('; '), errors });
  }
  const member = await Member.findById(req.member._id);
  if ((member.bodyMetrics || []).length >= MAX_ENTRIES) return res.status(400).json({ message: 'You have reached the limit of saved measurements. Delete some old ones first.' });
  const lastHeight = [...member.bodyMetrics].reverse().find((m) => Number.isFinite(m.heightCm))?.heightCm;
  const { weightKg, bodyFatPct, notes, date } = parsed.data;
  member.bodyMetrics.push({ date: date || new Date(), weightKg, bodyFatPct, heightCm: lastHeight, notes, source: 'member' });
  await member.save();
  logAudit(req, 'MEMBER_ADD_MEASUREMENT', { type: 'Member', id: member._id });
  res.status(201).json(await build(member._id));
};

// A member can remove only what they entered themselves: measurements a trainer took stay.
exports.remove = async (req, res) => {
  if (!/^[a-f\d]{24}$/i.test(req.params.entryId)) return res.status(404).json({ message: 'Measurement not found' });
  const result = await Member.updateOne(
    { _id: req.member._id, bodyMetrics: { $elemMatch: { _id: req.params.entryId, source: 'member' } } },
    { $pull: { bodyMetrics: { _id: req.params.entryId } } },
  );
  if (!result.matchedCount) return res.status(404).json({ message: 'Measurement not found, or it was recorded by your trainer.' });
  res.json(await build(req.member._id));
};
