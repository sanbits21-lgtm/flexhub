const crypto = require('crypto');
const { z } = require('zod');
const Member = require('../models/Member');
const generateToken = require('../utils/generateToken');
const { revokeActor } = require('../utils/sessions');
const { passwordProblem } = require('../utils/passwordPolicy');
const Equipment = require('../models/Equipment');
const User = require('../models/User');
const MemberPlan = require('../models/MemberPlan');
const PtSession = require('../models/PtSession');
const Booking = require('../models/Booking');
const { withDerivedStatus } = require('../utils/membershipStatus');
const { generatePlan, buildProfile } = require('../utils/planGenerator');
const { logAudit } = require('../utils/audit');
const { checkPhoto, storePhoto, removePhotoFile, sendPhoto } = require('../utils/photos');
const jwt = require('jsonwebtoken');
const MemberPayment = require('../models/MemberPayment');

// ---------- profile ----------

const optionalNumber = (min, max) => z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.coerce.number().min(min).max(max).optional(),
);

const profileSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  dob: z.preprocess((v) => (v === '' ? null : v), z.coerce.date().max(new Date()).nullable().optional()),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_say']).optional(),
  weightKg: optionalNumber(20, 400),
  heightCm: optionalNumber(80, 250),
  healthNotes: z.string().trim().max(500).optional(),
  fitnessGoal: z.enum(['lose_fat', 'build_muscle', 'stay_fit', 'improve_endurance']).optional(),
  experienceLevel: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  dietPreference: z.enum(['veg', 'eggetarian', 'non_veg', 'vegan']).optional(),
  emergencyContact: z.object({
    name: z.string().trim().max(80).optional(),
    phone: z.string().trim().max(20).optional(),
  }).optional(),
}).strict(); // anything else (email, phone, membership fields, tenantId…) is rejected, not ignored

// What the app is shown. Never the password hash, qr secret, or other tenants' ids beyond
// what the app needs.
const publicProfile = (member) => {
  const m = withDerivedStatus(member);
  const latest = [...(m.bodyMetrics || [])].reverse();
  return {
    _id: m._id,
    memberCode: m.memberCode,
    name: m.name,
    email: m.email,
    phone: m.phone,
    hasPhoto: !!m.photoUrl,
    dob: m.dob,
    gender: m.gender,
    weightKg: latest.find((x) => x.weightKg)?.weightKg ?? null,
    heightCm: latest.find((x) => x.heightCm)?.heightCm ?? null,
    healthNotes: m.healthNotes || '',
    fitnessGoal: m.fitnessGoal || null,
    experienceLevel: m.experienceLevel || null,
    dietPreference: m.dietPreference || null,
    emergencyContact: m.emergencyContact || {},
    membershipStatus: m.membershipStatus,
    membershipStart: m.membershipStart,
    membershipEnd: m.membershipEnd,
  };
};

exports.getProfile = async (req, res) => {
  const member = await Member.findById(req.member._id).select('-password');
  res.json(publicProfile(member));
};

exports.updateProfile = async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => ({ field: i.path.join('.') || '(body)', message: i.message }));
    return res.status(400).json({ message: `Invalid request: ${errors.map((e) => `${e.field} ${e.message}`).join('; ')}`, errors });
  }
  const { weightKg, heightCm, ...rest } = parsed.data;
  const member = await Member.findById(req.member._id);

  Object.assign(member, rest);
  if (rest.emergencyContact) member.emergencyContact = { ...(member.emergencyContact?.toObject?.() || {}), ...rest.emergencyContact };
  // Weight/height live in the existing bodyMetrics history (staff and trainers already read
  // it for progress). A change appends a dated entry rather than overwriting the past.
  if (weightKg !== undefined || heightCm !== undefined) {
    const last = [...member.bodyMetrics].reverse();
    member.bodyMetrics.push({
      date: new Date(),
      weightKg: weightKg ?? last.find((m) => m.weightKg)?.weightKg,
      heightCm: heightCm ?? last.find((m) => m.heightCm)?.heightCm,
      source: 'member',
    });
  }
  await member.save();
  logAudit(req, 'MEMBER_SELF_UPDATE_PROFILE', { type: 'Member', id: member._id });
  res.json(publicProfile(member));
};

// ---------- photo ----------

const FOLDER = 'member-photos';

exports.uploadPhoto = async (req, res) => {
  const checked = checkPhoto(req.body && req.body.image);
  if (checked.message) return res.status(checked.status).json({ message: checked.message });
  const file = await storePhoto(FOLDER, req.member._id, checked.buf, checked.type);

  const member = await Member.findById(req.member._id);
  const previous = member.photoUrl;
  member.photoUrl = file;
  await member.save();
  if (previous && previous !== file) await removePhotoFile(FOLDER, previous);
  logAudit(req, 'MEMBER_SELF_UPDATE_PHOTO', { type: 'Member', id: member._id });
  res.json({ hasPhoto: true });
};

// Served through the API (not a public static folder) so a photo is only visible to the
// member themselves and staff of the same gym.
exports.getPhoto = async (req, res) => {
  const member = await Member.findById(req.params.memberId).select('photoUrl tenantId');
  if (!member || !member.photoUrl) return res.status(404).json({ message: 'No photo' });

  if (req.actorType === 'member') {
    if (String(member._id) !== String(req.member._id)) return res.status(403).json({ message: 'Forbidden' });
  } else if (!['super-admin', 'platform-admin'].includes(req.user.role)) {
    // Same reach as the Members list: this gym; a branch manager or trainer only their own branch; a trainer
    // only the members assigned to them.
    const staff = req.user;
    const full = await Member.findById(member._id).select('branchId assignedTrainerId').lean();
    const sameGym = String(member.tenantId) === String(staff.tenantId);
    const sameBranch = staff.role === 'tenant-admin' || String(full.branchId) === String(staff.branchId);
    const assigned = staff.role !== 'trainer' || String(full.assignedTrainerId) === String(staff._id);
    if (!sameGym || !sameBranch || !assigned) return res.status(403).json({ message: 'Forbidden' });
  }
  return sendPhoto(res, FOLDER, member.photoUrl);
};

// ---------- read-only branch views ----------

exports.listEquipment = async (req, res) => {
  const items = await Equipment.find({ tenantId: req.member.tenantId, branchId: req.member.branchId, status: { $ne: 'retired' } })
    .select('name category status')
    .sort({ category: 1, name: 1 });
  res.json(items);
};

// Name and specialization only: contact details and salary are staff business, and a
// member wanting a trainer asks at the desk.
exports.listTrainers = async (req, res) => {
  const trainers = await User.find({ tenantId: req.member.tenantId, branchId: req.member.branchId, role: 'trainer', isActive: true })
    .select('name specialization')
    .sort({ name: 1 });
  res.json({ trainers, assignedTrainerId: req.member.assignedTrainerId || null });
};

// ---------- plans ----------

const DAILY_GENERATION_LIMIT = 5;

exports.getPlans = async (req, res) => {
  // Two shelves per type: what the member generated themselves, and what their trainer
  // assigned. Both are shown; neither replaces the other.
  const latest = (type, staff) => MemberPlan.findOne({
    memberId: req.member._id, type, isActive: { $ne: false }, source: staff ? 'staff' : { $ne: 'staff' },
  }).sort({ createdAt: -1 }).select('source content createdAt createdByName');
  const [workout, diet, assignedWorkout, assignedDiet] = await Promise.all([
    latest('workout', false), latest('diet', false), latest('workout', true), latest('diet', true),
  ]);
  res.json({ workout, diet, assignedWorkout, assignedDiet });
};

const generateSchema = z.object({
  type: z.enum(['workout', 'diet']),
  daysPerWeek: z.coerce.number().int().min(1).max(5).default(3),
});

exports.generate = async (req, res) => {
  const parsed = generateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid request: type must be "workout" or "diet".' });
  const { type, daysPerWeek } = parsed.data;

  // Each generation can be a paid model call, so cap it per member.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await MemberPlan.countDocuments({ memberId: req.member._id, source: { $ne: 'staff' }, createdAt: { $gte: since } });
  if (recent >= DAILY_GENERATION_LIMIT) {
    return res.status(429).json({ message: `You can generate ${DAILY_GENERATION_LIMIT} plans a day. Try again tomorrow.` });
  }

  const member = await Member.findById(req.member._id).select('-password');
  const equipment = (await Equipment.find({ tenantId: member.tenantId, branchId: member.branchId, status: 'operational' }).select('name')).map((e) => e.name);
  const profile = buildProfile(member, equipment, daysPerWeek);

  const { source, content } = await generatePlan({ type, profile, allowAi: req.features?.['features:aiPlans'] !== false });
  const plan = await MemberPlan.create({
    tenantId: member.tenantId, branchId: member.branchId, memberId: member._id, type, source, content,
  });
  res.status(201).json({ _id: plan._id, source, content, createdAt: plan.createdAt });
};

// ---------- password ----------

exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 72) {
    return res.status(400).json({ message: 'New password must be 8 to 72 characters.' });
  }
  const member = await Member.findById(req.member._id);
  // 400, not 401: a wrong password here is a bad request. 401 means the SESSION is bad, and the apps
  // answer that by signing the member out.
  if (!(await member.matchPassword(currentPassword))) return res.status(400).json({ message: 'Current password is incorrect.' });
  const weak = passwordProblem(newPassword, member);
  if (weak) return res.status(400).json({ message: weak });
  member.password = newPassword;
  member.passwordResetAt = new Date(); // other phones/browsers are signed out; this one gets a fresh token
  await member.save();
  await revokeActor('member', member._id, req.sid);
  logAudit(req, 'MEMBER_CHANGE_PASSWORD', { type: 'Member', id: member._id });
  res.json({ message: 'Password updated', token: generateToken(member._id, 'member', req.sid) });
};
// ---------- delete my account ----------

// App stores require in-app account deletion. Personal data is erased; the gym's own
// financial and attendance records (payments, check-ins) are kept, linked only to the
// member code, because the gym must retain its books. Future sessions are cancelled so a
// trainer is not left waiting for someone who no longer exists.
exports.deleteAccount = async (req, res) => {
  const { password } = req.body || {};
  if (typeof password !== 'string' || !password) return res.status(400).json({ message: 'Enter your password to delete your account.' });
  const member = await Member.findById(req.member._id);
  if (!(await member.matchPassword(password))) return res.status(400).json({ message: 'Password is incorrect.' });

  const photo = member.photoUrl;
  const now = new Date();
  await revokeActor('member', member._id);
  // updateOne skips schema validators on purpose: required fields (phone, password) are
  // overwritten with placeholders rather than removed.
  await Member.updateOne({ _id: member._id }, {
    $set: {
      name: 'Deleted member', phone: 'deleted', password: await require('bcryptjs').hash(crypto.randomBytes(32).toString('hex'), 10),
      isActive: false, membershipStatus: 'cancelled', passwordResetAt: now, bodyMetrics: [], assignedTrainerId: null,
    },
    $unset: { email: '', photoUrl: '', dob: '', gender: '', emergencyContact: '', healthNotes: '', fitnessGoal: '', experienceLevel: '', dietPreference: '' },
  });
  await Promise.all([
    MemberPlan.deleteMany({ memberId: member._id }),
    PtSession.updateMany({ memberId: member._id, status: 'scheduled', startAt: { $gte: now } }, { $set: { status: 'cancelled' } }),
    Booking.updateMany({ memberId: member._id, status: { $in: ['booked', 'waitlisted'] } }, { $set: { status: 'cancelled' } }),
  ]);
  if (photo) removePhotoFile(FOLDER, photo);
  logAudit(req, 'MEMBER_DELETE_ACCOUNT', { type: 'Member', id: member._id });
  res.json({ message: 'Account deleted' });
};

// ---------- my schedule ----------

// Upcoming one-to-one sessions plus the group classes the member is booked into. Classes
// are read-only here (booking is done by staff); PT sessions can be cancelled by the member.
exports.mySessions = async (req, res) => {
  const now = new Date();
  const [pt, bookings] = await Promise.all([
    PtSession.find({ memberId: req.member._id, status: { $in: ['scheduled', 'completed', 'no-show'] }, endAt: { $gte: new Date(now.getTime() - 14 * 86400000) } })
      .sort({ startAt: 1 }).limit(60).populate('trainerId', 'name'),
    Booking.find({ memberId: req.member._id, status: { $in: ['booked', 'waitlisted'] } })
      .populate({ path: 'classSessionId', populate: [{ path: 'classTypeId', select: 'name' }, { path: 'trainerId', select: 'name' }] }),
  ]);
  const classes = bookings
    .filter((b) => b.classSessionId && b.classSessionId.status !== 'cancelled' && b.classSessionId.endAt >= now)
    .map((b) => ({
      _id: b._id,
      status: b.status,
      name: b.classSessionId.classTypeId?.name || 'Class',
      trainerName: b.classSessionId.trainerId?.name || null,
      startAt: b.classSessionId.startAt,
      endAt: b.classSessionId.endAt,
    }))
    .sort((a, b) => a.startAt - b.startAt);
  res.json({
    training: pt.map((s) => ({
      _id: s._id, status: s.status, startAt: s.startAt, endAt: s.endAt, focus: s.focus || '', notes: s.notes || '', trainerName: s.trainerId?.name || null,
    })),
    classes,
  });
};

exports.cancelMySession = async (req, res) => {
  const session = await PtSession.findOne({ _id: req.params.id, memberId: req.member._id });
  if (!session) return res.status(404).json({ message: 'Session not found' });
  if (session.status !== 'scheduled' || session.startAt <= new Date()) {
    return res.status(400).json({ message: 'Only an upcoming session can be cancelled.' });
  }
  session.status = 'cancelled';
  session.cancelledBy = 'member';
  session.cancelledAt = new Date();
  await session.save();
  logAudit(req, 'MEMBER_CANCEL_PT_SESSION', { type: 'PtSession', id: session._id });
  res.json({ message: 'Session cancelled' });
};

// ---------- QR pass ----------

// A signed pass that is only good for two minutes, so a screenshot shared with a friend stops
// working almost at once. The app re-requests it; the front desk's scan (attendance /scan)
// checks the signature, the purpose and that the member belongs to that gym.
const PASS_SECONDS = 120;
exports.pass = async (req, res) => {
  const token = jwt.sign({ sub: String(req.member._id), purpose: 'checkin' }, process.env.JWT_SECRET, { expiresIn: PASS_SECONDS });
  res.json({ token, expiresAt: new Date(Date.now() + PASS_SECONDS * 1000), memberCode: req.member.memberCode, name: req.member.name });
};

// ---------- payment history ----------

exports.myPayments = async (req, res) => {
  const rows = await MemberPayment.find({ memberId: req.member._id })
    .sort({ createdAt: -1 })
    .limit(100)
    .populate('membershipPlanId', 'name')
    .select('invoiceNumber amount method status paidAt createdAt membershipPlanId');
  res.json(rows);
};
