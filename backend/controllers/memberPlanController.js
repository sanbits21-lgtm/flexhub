const Member = require('../models/Member');
const Equipment = require('../models/Equipment');
const MemberPlan = require('../models/MemberPlan');
const { buildMemberFilter } = require('./memberController');
const { generatePlan, buildProfile, SCHEMAS, DISCLAIMER } = require('../utils/planGenerator');
const { logAudit } = require('../utils/audit');

// Trainers, branch managers and tenant admins writing plans for a member. Scope is the
// same one the Members page uses (buildMemberFilter): a trainer reaches only the members
// assigned to them, a branch manager their branch, a tenant admin their gym.
const findMember = (req) => Member.findOne({ ...buildMemberFilter(req), _id: req.params.id, isActive: true }).select('-password');

const TYPES = ['workout', 'diet'];

exports.list = async (req, res) => {
  const member = await findMember(req);
  if (!member) return res.status(404).json({ message: 'Member not found' });
  const plans = await MemberPlan.find({ memberId: member._id, source: 'staff', isActive: { $ne: false } })
    .sort({ createdAt: -1 })
    .limit(20)
    .select('type content createdAt createdByName');
  // Newest per type is what the member sees; older ones stay as history for editing.
  const current = {};
  plans.forEach((p) => { if (!current[p.type]) current[p.type] = p; });
  res.json({ current, history: plans });
};

// A starting point for the editor: the same generator the member app uses, but returned
// unsaved so staff can adjust it before it reaches the member.
exports.draft = async (req, res) => {
  const type = req.body?.type;
  if (!TYPES.includes(type)) return res.status(400).json({ message: 'type must be "workout" or "diet".' });
  const member = await findMember(req);
  if (!member) return res.status(404).json({ message: 'Member not found' });

  const days = Math.min(Math.max(Number(req.body?.daysPerWeek) || 3, 1), 5);
  const equipment = (await Equipment.find({ tenantId: member.tenantId, branchId: member.branchId, status: 'operational' }).select('name')).map((e) => e.name);
  const { source, content } = await generatePlan({
    type,
    profile: buildProfile(member, equipment, days),
    allowAi: req.features?.['features:aiPlans'] !== false,
  });
  res.json({ source, content });
};

exports.create = async (req, res) => {
  const { type, content } = req.body || {};
  if (!TYPES.includes(type)) return res.status(400).json({ message: 'type must be "workout" or "diet".' });
  const parsed = SCHEMAS[type].safeParse(content);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    return res.status(400).json({ message: `Invalid plan: ${errors.slice(0, 3).map((e) => `${e.field} ${e.message}`).join('; ')}`, errors });
  }
  const member = await findMember(req);
  if (!member) return res.status(404).json({ message: 'Member not found' });

  const plan = await MemberPlan.create({
    tenantId: member.tenantId,
    branchId: member.branchId,
    memberId: member._id,
    type,
    source: 'staff',
    // The standard disclaimer is always attached server-side; staff cannot save a plan
    // that drops it, and the member app relies on it being present.
    content: { ...parsed.data, disclaimer: DISCLAIMER },
    createdBy: req.user._id,
    createdByName: req.user.name,
  });
  logAudit(req, 'ASSIGN_MEMBER_PLAN', { type: 'Member', id: member._id, metadata: { planType: type, planId: plan._id } });
  res.status(201).json(plan);
};

// Withdraws a plan from the member's app. The record stays for the audit trail.
exports.withdraw = async (req, res) => {
  const member = await findMember(req);
  if (!member) return res.status(404).json({ message: 'Member not found' });
  const plan = await MemberPlan.findOneAndUpdate(
    { _id: req.params.planId, memberId: member._id, source: 'staff', isActive: { $ne: false } },
    { isActive: false },
    { new: true },
  );
  if (!plan) return res.status(404).json({ message: 'Plan not found' });
  logAudit(req, 'WITHDRAW_MEMBER_PLAN', { type: 'Member', id: member._id, metadata: { planType: plan.type, planId: plan._id } });
  res.json({ message: 'Plan withdrawn' });
};
