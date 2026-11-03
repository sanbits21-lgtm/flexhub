const User = require('../models/User');
const Member = require('../models/Member');
const MemberPayment = require('../models/MemberPayment');
const Branch = require('../models/Branch');
const { logAudit } = require('../utils/audit');
const { sendList } = require('../utils/paginate');
const { generateTempPassword } = require('../utils/tempPassword');

// Lists staff within the caller's scope (tenant-admin sees managers+trainers across the
// tenant; branch-manager sees trainers in their own branch).
exports.list = async (req, res) => {
  const filter = { ...req.scope };
  delete filter.trainerId;
  if (req.query.role) filter.role = req.query.role;
  else filter.role = { $in: ['branch-manager', 'trainer'] };

  await sendList(res, req, User, filter, { select: '-password' });
};

// Tenant-admin only: per-trainer collections (sum of paid payments from members
// assigned to that trainer, via Member.assignedTrainerId) alongside salary.
exports.trainerReport = async (req, res) => {
  const filter = { ...req.scope, role: 'trainer' };
  delete filter.trainerId;

  const trainers = await User.find(filter).select('-password').populate('branchId', 'name').sort({ name: 1 });
  const trainerIds = trainers.map((t) => t._id);

  const members = await Member.find({ assignedTrainerId: { $in: trainerIds }, isActive: true }).select('_id assignedTrainerId');
  const memberIdsByTrainer = {};
  members.forEach((m) => {
    const key = m.assignedTrainerId.toString();
    (memberIdsByTrainer[key] ||= []).push(m._id);
  });

  const collectionsAgg = await MemberPayment.aggregate([
    { $match: { memberId: { $in: members.map((m) => m._id) }, status: 'paid' } },
    { $group: { _id: '$memberId', total: { $sum: '$amount' } } },
  ]);
  const amountByMember = {};
  collectionsAgg.forEach((c) => { amountByMember[c._id.toString()] = c.total; });

  const report = trainers.map((t) => {
    const memberIds = memberIdsByTrainer[t._id.toString()] || [];
    const collections = memberIds.reduce((sum, mId) => sum + (amountByMember[mId.toString()] || 0), 0);
    return {
      _id: t._id,
      name: t.name,
      email: t.email,
      branchName: t.branchId?.name,
      specialization: t.specialization,
      salary: t.salary,
      assignedMemberCount: memberIds.length,
      collections,
    };
  });
  res.json(report);
};

// Branch-manager creates a trainer in their own branch (implicit). Tenant-admin isn't
// locked to one branch, so they must pick one — validated against their own tenant,
// same pattern as memberController.create / equipmentController.create.
exports.createTrainer = async (req, res) => {
  const { name, email, phone, password, specialization } = req.body;
  let branchId = req.scope.branchId;

  if (req.user.role === 'tenant-admin') {
    if (!req.body.branchId) return res.status(400).json({ message: 'branchId is required' });
    const branch = await Branch.findOne({ _id: req.body.branchId, tenantId: req.scope.tenantId });
    if (!branch) return res.status(400).json({ message: 'Branch not found for this tenant' });
    branchId = req.body.branchId;
  }

  const trainer = await User.create({
    name, email, phone, password, specialization,
    role: 'trainer',
    tenantId: req.scope.tenantId,
    branchId,
  });
  logAudit(req, 'CREATE_TRAINER', { type: 'User', id: trainer._id });
  res.status(201).json({ ...trainer.toObject(), password: undefined });
};

exports.update = async (req, res) => {
  const { name, phone, specialization, isActive, salary } = req.body;
  const filter = { ...req.scope };
  delete filter.trainerId;
  const updateFields = { name, phone, specialization, isActive };
  // Salary is compensation data — only a tenant-admin may set it, never a branch-manager.
  if (req.user.role === 'tenant-admin' && salary !== undefined) updateFields.salary = salary;
  const staffMember = await User.findOneAndUpdate(
    { _id: req.params.id, ...filter },
    updateFields,
    { new: true }
  ).select('-password');
  if (!staffMember) return res.status(404).json({ message: 'Staff member not found' });
  logAudit(req, 'UPDATE_STAFF', { type: 'User', id: staffMember._id });
  res.json(staffMember);
};

exports.remove = async (req, res) => {
  const filter = { ...req.scope };
  delete filter.trainerId;
  const staffMember = await User.findOneAndUpdate(
    { _id: req.params.id, ...filter },
    { isActive: false },
    { new: true }
  );
  if (!staffMember) return res.status(404).json({ message: 'Staff member not found' });
  logAudit(req, 'DEACTIVATE_STAFF', { type: 'User', id: staffMember._id });
  res.json({ message: 'Staff member deactivated' });
};

exports.getAssignedMembers = async (req, res) => {
  const trainer = await User.findOne({ _id: req.params.id, ...req.scope, role: 'trainer' });
  if (!trainer) return res.status(404).json({ message: 'Trainer not found' });
  // Member.assignedTrainerId is the real relationship — see buildMemberFilter comment
  // in memberController.js for why User.assignedMembers is never used for this.
  const members = await Member.find({ assignedTrainerId: trainer._id, isActive: true }).select('name memberCode membershipStatus');
  res.json(members);
};

// Forgotten trainer password. There is no self-service reset (no email/SMS channel yet),
// so a manager issues a temporary one in person. Same shape as a member's app login: shown
// once, never stored readable, and every session the trainer already had is revoked.
// Trainers only: a manager's password is not another manager's to reset.
exports.resetPassword = async (req, res) => {
  const filter = { ...req.scope };
  delete filter.trainerId;
  const trainer = await User.findOne({ ...filter, _id: req.params.id, role: 'trainer', isActive: true });
  if (!trainer) return res.status(404).json({ message: 'Trainer not found' });
  const password = generateTempPassword();
  trainer.password = password; // hashed by the model's pre-save hook
  trainer.passwordResetAt = new Date();
  await trainer.save();
  logAudit(req, 'RESET_TRAINER_PASSWORD', { type: 'User', id: trainer._id });
  res.json({ name: trainer.name, email: trainer.email, password });
};
