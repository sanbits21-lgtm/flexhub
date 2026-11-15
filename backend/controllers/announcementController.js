const Announcement = require('../models/Announcement');
const AnnouncementRead = require('../models/AnnouncementRead');
const Member = require('../models/Member');
const Branch = require('../models/Branch');
const MembershipPlan = require('../models/MembershipPlan');
const Tenant = require('../models/Tenant');
const { audienceFilter, branchFilter, DEFAULT_DAYS, DEFAULT_EXPIRING, DEFAULT_EXPIRED } = require('../utils/notices');
const { logAudit } = require('../utils/audit');

const isAdmin = (req) => req.user.role === 'tenant-admin';
const unique = (ids) => [...new Set((ids || []).map(String))];

// The owner sees every notice of the gym (narrowed to a branch when drilling into one); a manager sees the ones that
// reach their branch, and can change only the ones they wrote.
const visible = (req) => {
  const f = { tenantId: req.scope.tenantId };
  if (req.scope.branchId) f.$or = [{ branchIds: { $size: 0 } }, { branchIds: req.scope.branchId }];
  return f;
};
const mayChange = (req, notice) => isAdmin(req) || String(notice.createdBy) === String(req.user._id);

const reachCount = (tenantId, branchIds, audience, now = new Date()) => Member.countDocuments({
  tenantId, isActive: true, ...branchFilter(branchIds), ...audienceFilter(audience, now),
});

// Where a notice is in its life, for the list.
const stageOf = (n, now) => {
  if (n.status === 'withdrawn') return 'withdrawn';
  if (n.startsAt > now) return 'scheduled';
  if (n.expiresAt && n.expiresAt <= now) return 'ended';
  return 'live';
};

exports.list = async (req, res) => {
  const now = new Date();
  const rows = await Announcement.find(visible(req)).sort({ createdAt: -1 }).limit(50).lean();
  const reads = rows.length
    ? await AnnouncementRead.aggregate([{ $match: { announcementId: { $in: rows.map((r) => r._id) } } }, { $group: { _id: '$announcementId', n: { $sum: 1 } } }])
    : [];
  const items = await Promise.all(rows.map(async (n) => ({
    ...n,
    stage: stageOf(n, now),
    readCount: reads.find((r) => String(r._id) === String(n._id))?.n || 0,
    reach: await reachCount(req.scope.tenantId, n.branchIds, n.audience, now),
    canManage: mayChange(req, n),
  })));
  res.json(items);
};

// Checks an audience the request describes, and returns the clean version (or an error message).
const readAudience = async (tenantId, audience = { type: 'everyone' }) => {
  const a = { type: audience.type || 'everyone' };
  if (a.type === 'expiring') a.days = audience.days || 7;
  if (a.type === 'plan') {
    if (!audience.planId) return { error: 'Choose which plan the notice is for.' };
    if (!(await MembershipPlan.exists({ _id: audience.planId, tenantId }))) return { error: 'Plan not found for this tenant' };
    a.planId = audience.planId;
  }
  return { audience: a };
};

const readBranches = async (req, requested) => {
  if (!isAdmin(req)) return { ids: [req.scope.branchId] };
  const ids = unique(requested);
  if (ids.length && (await Branch.countDocuments({ _id: { $in: ids }, tenantId: req.scope.tenantId })) !== ids.length) return { error: 'Branch not found for this tenant' };
  return { ids };
};

exports.create = async (req, res) => {
  const b = req.body;
  const branches = await readBranches(req, b.branchIds);
  if (branches.error) return res.status(400).json({ message: branches.error });
  const a = await readAudience(req.scope.tenantId, b.audience);
  if (a.error) return res.status(400).json({ message: a.error });
  const startsAt = b.startsAt ? new Date(b.startsAt) : new Date();
  const expiresAt = b.expiresAt ? new Date(b.expiresAt) : null;
  if (Number.isNaN(startsAt.getTime()) || (expiresAt && Number.isNaN(expiresAt.getTime()))) return res.status(400).json({ message: 'A date is not valid.' });
  if (expiresAt && expiresAt <= startsAt) return res.status(400).json({ message: 'The notice must end after it starts.' });
  const notice = await Announcement.create({
    tenantId: req.scope.tenantId, branchIds: branches.ids, title: b.title, body: b.body, kind: b.kind || 'news', audience: a.audience,
    startsAt, expiresAt, link: b.link || undefined, createdBy: req.user._id, createdByName: req.user.name,
  });
  logAudit(req, 'PUBLISH_NOTICE', { type: 'Announcement', id: notice._id });
  res.status(201).json(notice);
};

const findChangeable = async (req, res) => {
  const notice = await Announcement.findOne({ ...visible(req), _id: req.params.id });
  if (!notice) { res.status(404).json({ message: 'Notice not found' }); return null; }
  if (!mayChange(req, notice)) { res.status(403).json({ message: 'You can only change notices you published.' }); return null; }
  return notice;
};

exports.update = async (req, res) => {
  const notice = await findChangeable(req, res);
  if (!notice) return;
  const b = req.body;
  if (b.title !== undefined) notice.title = b.title;
  if (b.body !== undefined) notice.body = b.body;
  if (b.kind !== undefined) notice.kind = b.kind;
  if (b.link !== undefined) notice.link = b.link || undefined;
  if (b.expiresAt !== undefined) {
    const expiresAt = b.expiresAt ? new Date(b.expiresAt) : null;
    if (expiresAt && (Number.isNaN(expiresAt.getTime()) || expiresAt <= notice.startsAt)) return res.status(400).json({ message: 'The notice must end after it starts.' });
    notice.expiresAt = expiresAt;
  }
  await notice.save();
  logAudit(req, 'UPDATE_NOTICE', { type: 'Announcement', id: notice._id });
  res.json(notice);
};

exports.withdraw = async (req, res) => {
  const notice = await findChangeable(req, res);
  if (!notice) return;
  notice.status = 'withdrawn';
  await notice.save();
  logAudit(req, 'WITHDRAW_NOTICE', { type: 'Announcement', id: notice._id });
  res.json(notice);
};

// "This will reach 214 members", before anything is published.
exports.preview = async (req, res) => {
  const branches = await readBranches(req, req.body.branchIds);
  if (branches.error) return res.status(400).json({ message: branches.error });
  const a = await readAudience(req.scope.tenantId, req.body.audience);
  if (a.error) return res.status(400).json({ message: a.error });
  res.json({ count: await reachCount(req.scope.tenantId, branches.ids, a.audience) });
};

// ---- the automatic renewal reminder (owner only) ----

const reminderView = (tenant) => {
  const r = tenant.notices?.reminders || {};
  return {
    enabled: !!r.enabled,
    daysBefore: r.daysBefore?.length ? r.daysBefore : DEFAULT_DAYS,
    expiringText: r.expiringText || '',
    expiredText: r.expiredText || '',
    defaults: { expiringText: DEFAULT_EXPIRING, expiredText: DEFAULT_EXPIRED },
  };
};

exports.getReminders = async (req, res) => {
  const tenant = await Tenant.findById(req.scope.tenantId).select('notices');
  res.json(reminderView(tenant));
};

exports.putReminders = async (req, res) => {
  const tenant = await Tenant.findById(req.scope.tenantId);
  const b = req.body;
  const r = tenant.notices.reminders;
  r.enabled = b.enabled;
  if (b.daysBefore) r.daysBefore = [...new Set(b.daysBefore)].sort((x, y) => y - x);
  if (b.expiringText !== undefined) r.expiringText = b.expiringText;
  if (b.expiredText !== undefined) r.expiredText = b.expiredText;
  await tenant.save();
  logAudit(req, 'UPDATE_RENEWAL_REMINDERS', { type: 'Tenant', id: tenant._id });
  res.json(reminderView(tenant));
};

