const crypto = require('crypto');
// A random id for a member's QR secret: Node's own generator, so no extra dependency.
const uuidv4 = () => crypto.randomUUID();
const Member = require('../models/Member');
const Branch = require('../models/Branch');
const User = require('../models/User');
const MembershipPlan = require('../models/MembershipPlan');
const MemberPayment = require('../models/MemberPayment');
const { addPlanDuration } = require('../utils/planDuration');
const { withDerivedStatus, statusFilter } = require('../utils/membershipStatus');
const { logAudit } = require('../utils/audit');
const q = require('../utils/query');
const { pageParams } = require('../utils/paginate');
const { generateTempPassword } = require('../utils/tempPassword');
const { cleanCustomFields, phoneKey } = require('../utils/memberFields');

// Builds the Mongo filter for the caller's scope, translating the trainer's
// virtual `trainerId` scope key (not a Member field) into the real relationship:
// Member.assignedTrainerId (User.assignedMembers is never populated by anything).
const newMemberCode = () => `GYM-${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

const buildMemberFilter = (req) => {
  const filter = { ...req.scope };
  delete filter.memberId;
  if (req.actorType === 'user' && req.user.role === 'trainer') {
    delete filter.trainerId;
    filter.assignedTrainerId = req.user._id;
  }
  return filter;
};

// Deactivation is a soft delete (isActive: false), so every list-style read has to
// exclude them or "deleted" members keep showing up in lists, counts and expiry
// chases. `?includeInactive=true` opts back in so staff can find and reactivate them.
const applyActiveFilter = (filter, req) => {
  if (req.query.includeInactive !== 'true') filter.isActive = true;
  return filter;
};

exports.list = async (req, res) => {
  const { page, limit } = pageParams(req);
  const search = q.str(req.query.search, 'search', 60);
  const membershipStatus = q.oneOf(req.query.membershipStatus, ['active', 'expired', 'frozen', 'cancelled'], 'membershipStatus');
  const membershipPlanId = q.oid(req.query.membershipPlanId, 'membershipPlanId');
  const expiringInDays = q.int(req.query.expiringInDays, { name: 'expiringInDays', min: 0, max: 3650 });
  const filter = applyActiveFilter(buildMemberFilter(req), req);
  // Escaped: a bracket typed into the search box is text, not a regex.
  if (search) filter.name = { $regex: q.escapeRegex(search), $options: 'i' };
  if (membershipPlanId) filter.membershipPlanId = membershipPlanId;

  // Status and expiry-window conditions both constrain membershipEnd (and may each
  // carry an $or), so they're combined under $and rather than merged into one object
  // literal where the later key would silently win.
  const conditions = [];
  // Status is derived from membershipEnd (see utils/membershipStatus.js), so the
  // filter has to match on the derived value, not just the stored one.
  if (membershipStatus) conditions.push(statusFilter(membershipStatus));
  if (expiringInDays !== undefined) {
    const now = new Date();
    const until = new Date(now.getTime() + expiringInDays * 24 * 60 * 60 * 1000);
    // Frozen/cancelled memberships aren't "expiring" in any useful sense — staff are
    // looking for running memberships they need to chase for renewal.
    conditions.push({ membershipEnd: { $gte: now, $lte: until }, membershipStatus: { $nin: ['cancelled', 'frozen'] } });
  }
  if (conditions.length) filter.$and = conditions;

  const members = await Member.find(filter)
    .select('-password')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));
  const total = await Member.countDocuments(filter);
  res.json({ members: members.map((m) => withDerivedStatus(m)), total, page, limit });
};

// A member calling :id routes may only ever target their own id — branchId alone
// doesn't uniquely identify one member, so without this a member could read any
// same-branch member's record by guessing their id.
const forbidCrossMemberAccess = (req, res) => {
  if (req.actorType === 'member' && req.params.id !== req.member._id.toString()) {
    res.status(403).json({ message: 'Forbidden' });
    return true;
  }
  return false;
};

exports.getOne = async (req, res) => {
  if (forbidCrossMemberAccess(req, res)) return;
  const filter = { ...buildMemberFilter(req), _id: req.params.id };
  const member = await Member.findOne(filter).select('-password');
  if (!member) return res.status(404).json({ message: 'Member not found' });
  res.json(withDerivedStatus(member));
};

exports.getProgress = async (req, res) => {
  if (forbidCrossMemberAccess(req, res)) return;
  const filter = { ...buildMemberFilter(req), _id: req.params.id };
  const member = await Member.findOne(filter).select('name memberCode bodyMetrics membershipStatus membershipEnd');
  if (!member) return res.status(404).json({ message: 'Member not found' });
  res.json(member);
};

// Member's own self-service view.
exports.getMe = async (req, res) => {
  res.json(req.member);
};

const Tenant = require('../models/Tenant');
const { accountFor } = require('../utils/paymentAccounts');
const { memberRoom } = require('../utils/subscription');
const { revokeActor } = require('../utils/sessions');

const memberFieldDefs = async (tenantId) => (await Tenant.findById(tenantId).select('memberFields').lean())?.memberFields || [];

// Phone -> name of the (not deactivated) member who already has it, for duplicate detection.
const existingPhones = async (tenantId) => {
  const members = await Member.find({ tenantId, isActive: true }).select('phone name').lean();
  const byPhone = new Map();
  members.forEach((m) => { const key = phoneKey(m.phone); if (key && !byPhone.has(key)) byPhone.set(key, m.name); });
  return byPhone;
};

const gymMemberRoom = async (tenantId) => {
  const tenant = await Tenant.findById(tenantId).select('maxMembers');
  return tenant ? memberRoom(tenant) : Infinity;
};
const memberLimitMessage = (room, wanted) => (wanted
  ? `Your plan has room for ${room} more member${room === 1 ? '' : 's'}, but this upload has ${wanted}. Upgrade to add more.`
  : 'You have reached the member limit of your free trial. Upgrade to add more members.');

exports.create = async (req, res) => {
  const room = await gymMemberRoom(req.body.tenantId);
  if (room < 1) return res.status(402).json({ code: 'MEMBER_LIMIT', message: memberLimitMessage(room) });
  let { name, email, phone, password, dob, gender, emergencyContact, membershipPlanId, membershipStart, assignedTrainerId } = req.body;
  // Off for this tenant: no-op rather than error. The frontend won't send it once the
  // field is hidden; a stale client shouldn't hard-fail over a disabled optional field.
  if (req.features && req.features['features:trainerAssignment'] === false) assignedTrainerId = undefined;

  // Branch-manager's own branch is stamped by enforceWriteScope; tenant-admin (who can
  // onboard into any branch of their tenant) must pick one, so validate it here.
  if (!req.body.branchId) return res.status(400).json({ message: 'branchId is required' });
  const branch = await Branch.findOne({ _id: req.body.branchId, tenantId: req.body.tenantId });
  if (!branch) return res.status(400).json({ message: 'Branch not found for this tenant' });

  // The end date is always derived server-side from the plan's duration, never trusted
  // from the client, so every caller (this form, future ones, direct API use) gets the
  // same math instead of each reimplementing "start + N months".
  const start = membershipStart ? new Date(membershipStart) : new Date();
  let end;
  if (membershipPlanId) {
    const plan = await MembershipPlan.findOne({ _id: membershipPlanId, tenantId: req.body.tenantId });
    if (!plan) return res.status(400).json({ message: 'Membership plan not found for this tenant' });
    end = addPlanDuration(start, plan.durationUnit);
  }

  // Optional — a member can be onboarded without a trainer. When given, validate it's an
  // actual trainer in this tenant, so a bad id can't silently corrupt the assignment.
  if (assignedTrainerId) {
    const trainer = await User.findOne({ _id: assignedTrainerId, tenantId: req.body.tenantId, role: 'trainer' });
    if (!trainer) return res.status(400).json({ message: 'Trainer not found for this tenant' });
  }

  const { set: customFields } = cleanCustomFields(await memberFieldDefs(req.body.tenantId), req.body.customFields);

  // Staff no longer set a member's password at onboarding time — a random one is
  // stamped here as a placeholder until the WhatsApp self-onboarding flow (member sets
  // their own password via a link) is built; a member can't log in with it as-is.
  const weak = password ? require('../utils/passwordPolicy').passwordProblem(password, { name, email, phone }) : null;
  if (weak) return res.status(400).json({ message: weak });
  const initialPassword = password || crypto.randomBytes(16).toString('hex');

  let member;
  // The code is time-based plus random, so two members created in the same millisecond
  // (a busy front desk, an import) do not collide; if one still does, try a fresh code.
  for (let attempt = 0; attempt < 5 && !member; attempt += 1) {
    try {
      member = await Member.create({
        tenantId: req.body.tenantId,
        branchId: req.body.branchId,
        memberCode: newMemberCode(),
        name, phone, dob, emergencyContact,
        password: initialPassword,
        email: email || undefined,
        gender: gender || undefined,
        membershipPlanId: membershipPlanId || undefined,
        membershipStart: start,
        membershipEnd: end,
        assignedTrainerId: assignedTrainerId || undefined,
        customFields: Object.keys(customFields).length ? customFields : undefined,
        qrCode: uuidv4(),
      });
    } catch (err) {
      if (err.code !== 11000) throw err;
      // Name the field that actually clashed: a code collision is not the user's email.
      if (err.keyPattern && err.keyPattern.memberCode) continue;
      return res.status(409).json({ message: 'A member with this email already exists in your gym.' });
    }
  }
  if (!member) return res.status(503).json({ message: 'Could not allocate a member code. Please try again.' });
  logAudit(req, 'CREATE_MEMBER', { type: 'Member', id: member._id });
  res.status(201).json({ ...member.toObject(), password: undefined });
};

// Bulk-onboards members from an already-parsed, already-column-mapped array (the
// client owns file parsing / header detection — this endpoint only ever sees the known
// Member fields, so unrecognized spreadsheet columns are implicitly ignored). One target
// branch for the whole batch; per-row plan lookup is validated against a preloaded map
// instead of a query per row. Failures are isolated per row, not batch-fatal.
exports.bulkCreate = async (req, res) => {
  const room = await gymMemberRoom(req.body.tenantId);
  if (Array.isArray(req.body.members) && req.body.members.length > room) {
    return res.status(402).json({ code: 'MEMBER_LIMIT', message: memberLimitMessage(room, req.body.members.length) });
  }
  const { branchId, members } = req.body;
  if (!branchId) return res.status(400).json({ message: 'branchId is required' });
  if (!Array.isArray(members) || members.length === 0) {
    return res.status(400).json({ message: 'members array is required' });
  }
  if (members.length > 1000) return res.status(400).json({ message: 'Max 1000 members per upload' });

  const branch = await Branch.findOne({ _id: branchId, tenantId: req.body.tenantId });
  if (!branch) return res.status(400).json({ message: 'Branch not found for this tenant' });

  const plans = await MembershipPlan.find({ tenantId: req.body.tenantId }).select('durationUnit price branchId');
  const planById = new Map(plans.map((p) => [p._id.toString(), p]));
  const fieldDefs = await memberFieldDefs(req.body.tenantId);
  // Opt-in so older clients keep their behaviour: skip a row whose phone already belongs to a
  // member of this gym, or repeats an earlier row of the same file.
  const skipDuplicatePhones = req.body.skipDuplicatePhones === true;
  const knownPhones = skipDuplicatePhones ? await existingPhones(req.body.tenantId) : new Map();
  const importedPhones = new Map();

  const results = [];
  let paymentsRecorded = 0;
  for (let i = 0; i < members.length; i++) {
    const row = members[i] || {};
    try {
      if (!row.name || !row.phone) throw new Error('Name and phone are required');
      const phoneId = phoneKey(row.phone);
      if (skipDuplicatePhones && phoneId) {
        if (knownPhones.has(phoneId)) throw new Error(`Phone already belongs to ${knownPhones.get(phoneId)}`);
        if (importedPhones.has(phoneId)) throw new Error(`Same phone as row ${importedPhones.get(phoneId) + 1}`);
      }
      const { set: customFields } = cleanCustomFields(fieldDefs, row.customFields);
      const emergency = row.emergencyContact && (row.emergencyContact.name || row.emergencyContact.phone)
        ? { name: String(row.emergencyContact.name || '').trim() || undefined, phone: String(row.emergencyContact.phone || '').trim() || undefined }
        : undefined;

      const start = row.membershipStart ? new Date(row.membershipStart) : new Date();
      let membershipPlanId;
      let plan;
      let end;
      if (row.membershipPlanId) {
        plan = planById.get(String(row.membershipPlanId));
        if (!plan) throw new Error('Membership plan not found for this tenant');
        // A plan set up for one branch is only for that branch (tenant-wide plans have no branch).
        if (plan.branchId && String(plan.branchId) !== String(branchId)) throw new Error('This plan belongs to a different branch');
        membershipPlanId = plan._id;
        end = addPlanDuration(start, plan.durationUnit);
      }

      // Date.now() alone can collide across rows in the same millisecond inside a tight
      // loop (unlike single create, which is always one HTTP request at a time); the row
      // index guarantees uniqueness within a batch.
      const memberCode = newMemberCode();

      const member = await Member.create({
        tenantId: req.body.tenantId,
        branchId,
        memberCode,
        name: row.name,
        phone: row.phone,
        password: crypto.randomBytes(16).toString('hex'),
        email: row.email || undefined,
        gender: row.gender || undefined,
        dob: row.dob || undefined,
        membershipPlanId,
        membershipStart: start,
        membershipEnd: end,
        emergencyContact: emergency,
        customFields: Object.keys(customFields).length ? customFields : undefined,
        qrCode: uuidv4(),
      });
      if (phoneId) importedPhones.set(phoneId, i);

      // A plan with no payment behind it was the gap that prompted this: the single
      // Add Member flow always records a payment when a plan is chosen, but bulk import
      // never did. Defaults to the plan's list price, cash, paid — same as the
      // single-member flow's default before any discount is applied; bulk import has no
      // per-row discount/amount override (that's a future column, not part of this).
      if (plan) {
        await MemberPayment.create({
          tenantId: req.body.tenantId,
          branchId,
          memberId: member._id,
          membershipPlanId: plan._id,
          amount: plan.price,
          method: 'cash',
          status: 'paid',
          invoiceNumber: `INV-${Date.now().toString(36).toUpperCase()}${i}`,
          paidAt: new Date(),
        });
        paymentsRecorded++;
      }

      results.push({ row: i, success: true, name: member.name, memberId: member._id });
    } catch (err) {
      const message = err.code === 11000 ? 'Duplicate email or member code' : err.message;
      results.push({ row: i, success: false, name: row.name, error: message });
    }
  }

  const succeeded = results.filter((r) => r.success).length;
  logAudit(req, 'BULK_CREATE_MEMBERS', { type: 'Member', metadata: { branchId, total: members.length, succeeded, paymentsRecorded } });
  res.status(201).json({ results, succeeded, failed: results.length - succeeded, paymentsRecorded });
};

// Members of this gym who already use a phone number, so the add/edit forms can warn. A warning
// and not a rule on purpose: a family can share one number. `excludeId` is the member being edited.
exports.phoneCheck = async (req, res) => {
  const key = phoneKey(req.body?.phone);
  if (key.length < 6) return res.json({ matches: [] });
  const filter = { tenantId: req.body.tenantId, isActive: true };
  if (require('mongoose').isValidObjectId(req.body.excludeId)) filter._id = { $ne: req.body.excludeId };
  const members = await Member.find(filter).select('phone name memberCode').lean();
  const matches = members.filter((m) => phoneKey(m.phone) === key).slice(0, 5)
    .map((m) => ({ _id: m._id, name: m.name, memberCode: m.memberCode }));
  res.json({ matches });
};

// Which rows of an about-to-be-imported file already match a member of this gym by phone,
// so the import screen can warn before anything is written.
exports.bulkCheck = async (req, res) => {
  const { phones } = req.body || {};
  if (!Array.isArray(phones) || phones.length === 0 || phones.length > 1000) {
    return res.status(400).json({ message: 'phones must be a list of 1 to 1000 numbers' });
  }
  const known = await existingPhones(req.body.tenantId);
  const existing = [];
  phones.forEach((phone, row) => {
    const key = phoneKey(phone);
    if (key && known.has(key)) existing.push({ row, memberName: known.get(key) });
  });
  res.json({ existing });
};

exports.update = async (req, res) => {
  const filter = { ...req.scope, _id: req.params.id };
  delete filter.memberId;
  delete filter.trainerId;
  let {
    name, phone, email, dob, gender, emergencyContact,
    membershipPlanId, membershipStart, membershipStatus,
    assignedTrainerId, isActive,
  } = req.body;
  if (req.features && req.features['features:trainerAssignment'] === false) assignedTrainerId = undefined;

  // Truthy = assigning/reassigning, validate ownership; null = explicitly clearing the
  // assignment (schema default), left alone; undefined = field not sent, untouched.
  if (assignedTrainerId) {
    const trainer = await User.findOne({ _id: assignedTrainerId, tenantId: req.scope.tenantId, role: 'trainer' });
    if (!trainer) return res.status(400).json({ message: 'Trainer not found for this tenant' });
  }

  const update = {
    name, phone, email, dob, gender, emergencyContact,
    membershipPlanId, membershipStart, membershipStatus, assignedTrainerId, isActive,
  };

  // Per-key writes, so editing one custom field never overwrites the others; a blank value clears it.
  if (req.body.customFields !== undefined) {
    const { set, unset } = cleanCustomFields(await memberFieldDefs(req.scope.tenantId), req.body.customFields);
    Object.entries(set).forEach(([key, value]) => { update[`customFields.${key}`] = value; });
    if (unset.length) update.$unset = Object.fromEntries(unset.map((key) => [`customFields.${key}`, '']));
  }

  // membershipEnd is never taken from the client — it's always derived from the plan's
  // duration, exactly like create and renew do. Accepting it raw let a caller set an
  // expiry inconsistent with the plan they're paying for.
  if (membershipPlanId || membershipStart) {
    const existing = await Member.findOne(filter).select('membershipPlanId membershipStart');
    if (!existing) return res.status(404).json({ message: 'Member not found' });
    const planId = membershipPlanId || existing.membershipPlanId;
    if (planId) {
      const plan = await MembershipPlan.findOne({ _id: planId, tenantId: req.scope.tenantId });
      if (!plan) return res.status(400).json({ message: 'Membership plan not found for this tenant' });
      const start = membershipStart ? new Date(membershipStart) : (existing.membershipStart || new Date());
      update.membershipEnd = addPlanDuration(start, plan.durationUnit);
    }
  }

  const member = await Member.findOneAndUpdate(filter, update, { new: true }).select('-password');
  if (!member) return res.status(404).json({ message: 'Member not found' });
  logAudit(req, 'UPDATE_MEMBER', { type: 'Member', id: member._id });
  res.json(withDerivedStatus(member));
};

// Renewal moves the membership dates AND records the payment in one call, on purpose:
// doing it as two separate client calls is how money gets collected while the
// membership silently stays expired.
exports.renew = async (req, res) => {
  const filter = { ...req.scope, _id: req.params.id };
  delete filter.memberId;
  delete filter.trainerId;
  const member = await Member.findOne(filter);
  if (!member) return res.status(404).json({ message: 'Member not found' });
  if (!member.isActive) return res.status(400).json({ message: 'This member is deactivated. Reactivate them before renewing.' });

  const { membershipPlanId, amount, method = 'cash' } = req.body;
  if (method === 'upi' && req.features && req.features['features:upiPayments'] === false) {
    return res.status(403).json({ message: 'UPI payment collection is not enabled for your gym. Contact support to enable it.' });
  }
  const planId = membershipPlanId || member.membershipPlanId;
  if (!planId) return res.status(400).json({ message: 'A membership plan is required to renew' });
  const plan = await MembershipPlan.findOne({ _id: planId, tenantId: member.tenantId });
  if (!plan) return res.status(400).json({ message: 'Membership plan not found for this tenant' });

  // Renewing early onto the SAME plan extends from the existing expiry so unused days
  // aren't burned. Switching to a DIFFERENT plan is treated as a correction/change, not
  // a top-up — it starts today regardless of remaining time, so a wrong plan picked by
  // mistake can actually be fixed rather than just queuing the right plan up behind it.
  // An already-lapsed membership always restarts from today either way. Same
  // calendar-month math as onboarding (utils/planDuration.js), never a fixed day count.
  const isPlanChange = member.membershipPlanId && String(member.membershipPlanId) !== String(plan._id);
  const now = new Date();
  const start = !isPlanChange && member.membershipEnd && new Date(member.membershipEnd) > now
    ? new Date(member.membershipEnd)
    : now;
  const end = addPlanDuration(start, plan.durationUnit);

  const updated = await Member.findOneAndUpdate(
    filter,
    { membershipPlanId: plan._id, membershipStart: start, membershipEnd: end, membershipStatus: 'active' },
    { new: true }
  ).select('-password');

  const payment = await MemberPayment.create({
    tenantId: member.tenantId,
    branchId: member.branchId,
    memberId: member._id,
    membershipPlanId: plan._id,
    amount: amount != null ? amount : plan.price,
    method,
    upiId: method === 'upi' ? (await accountFor(member.tenantId, member.branchId)).upiId || undefined : undefined,
    status: 'paid',
    invoiceNumber: `INV-${Date.now().toString(36).toUpperCase()}`,
    paidAt: now,
  });

  logAudit(req, 'RENEW_MEMBERSHIP', {
    type: 'Member',
    id: member._id,
    metadata: { paymentId: payment._id, membershipEnd: end, amount: payment.amount, method: payment.method },
  });
  res.json({ member: withDerivedStatus(updated), payment });
};

exports.remove = async (req, res) => {
  const filter = { ...req.scope, _id: req.params.id };
  delete filter.memberId;
  delete filter.trainerId;
  const member = await Member.findOneAndUpdate(filter, { isActive: false }, { new: true });
  if (!member) return res.status(404).json({ message: 'Member not found' });
  logAudit(req, 'DEACTIVATE_MEMBER', { type: 'Member', id: member._id });
  res.json({ message: 'Member deactivated' });
};

exports.addBodyMetric = async (req, res) => {
  const filter = { ...buildMemberFilter(req), _id: req.params.id };
  const { weightKg, heightCm, bodyFatPct, notes } = req.body;
  const member = await Member.findOneAndUpdate(
    filter,
    { $push: { bodyMetrics: { date: new Date(), weightKg, heightCm, bodyFatPct, notes } } },
    { new: true }
  ).select('bodyMetrics');
  if (!member) return res.status(404).json({ message: 'Member not found' });
  res.json(member);
};

// Mobile-app access. Members are created with a random password nobody knows (no
// self-onboarding flow yet), so staff issue a temporary one here and hand it over in
// person. It is returned once and never stored in readable form; the member changes it
// from the app. Generating a new one replaces the old: this is also the password-reset
// path for a member who has forgotten theirs.
exports.issueAppAccess = async (req, res) => {
  const filter = { ...buildMemberFilter(req), _id: req.params.id, isActive: true };
  const member = await Member.findOne(filter);
  if (!member) return res.status(404).json({ message: 'Member not found' });
  const password = generateTempPassword();
  member.password = password; // hashed by the model's pre-save hook
  member.passwordResetAt = new Date(); // signs the member out of any phone already logged in
  await member.save();
  await revokeActor('member', member._id);
  logAudit(req, 'ISSUE_MEMBER_APP_ACCESS', { type: 'Member', id: member._id });
  res.json({ memberCode: member.memberCode, email: member.email || null, password });
};
exports.buildMemberFilter = buildMemberFilter;
