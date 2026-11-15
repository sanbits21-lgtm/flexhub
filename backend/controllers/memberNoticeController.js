const Announcement = require('../models/Announcement');
const AnnouncementRead = require('../models/AnnouncementRead');
const Member = require('../models/Member');
const Tenant = require('../models/Tenant');
const { reaches, renewalReminder } = require('../utils/notices');

// What a member sees in the app. Everything here is worked out from the member's own record (the token decides who they
// are), so a notice can only come from their own gym and only if it is meant for someone like them.

const MEMBER_FIELDS = 'name branchId tenantId membershipStatus membershipEnd membershipPlanId';

const noticesFor = async (member, now) => {
  const rows = await Announcement.find({
    tenantId: member.tenantId,
    status: 'published',
    startsAt: { $lte: now },
    $and: [
      { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
      { $or: [{ branchIds: { $size: 0 } }, { branchIds: member.branchId }] },
    ],
  }).sort({ startsAt: -1 }).limit(100).lean();
  return rows.filter((n) => reaches(n, member, now)).slice(0, 50);
};

const featureOn = (req) => !(req.features && req.features['features:announcements'] === false);

exports.list = async (req, res) => {
  if (!featureOn(req)) return res.json({ items: [], unread: 0 });
  const now = new Date();
  const member = await Member.findById(req.member._id).select(MEMBER_FIELDS).lean();
  const [notices, tenant] = await Promise.all([noticesFor(member, now), Tenant.findById(member.tenantId).select('notices')]);
  const reads = notices.length ? await AnnouncementRead.find({ memberId: member._id, announcementId: { $in: notices.map((n) => n._id) } }).select('announcementId').lean() : [];
  const readIds = new Set(reads.map((r) => String(r.announcementId)));

  const items = notices.map((n) => ({ id: String(n._id), kind: n.kind, title: n.title, body: n.body, link: n.link || null, at: n.startsAt, read: readIds.has(String(n._id)), auto: false }));
  const reminder = renewalReminder(tenant?.notices?.reminders, member, now);
  if (reminder) items.unshift({ ...reminder, read: false });
  res.json({ items, unread: items.filter((i) => !i.read).length });
};

const markMany = async (member, ids) => {
  if (!ids.length) return;
  await AnnouncementRead.bulkWrite(ids.map((id) => ({
    updateOne: { filter: { announcementId: id, memberId: member._id }, update: { $setOnInsert: { tenantId: member.tenantId, readAt: new Date() } }, upsert: true },
  })));
};

exports.markRead = async (req, res) => {
  const member = await Member.findById(req.member._id).select(MEMBER_FIELDS).lean();
  const notice = (await noticesFor(member, new Date())).find((n) => String(n._id) === req.params.id);
  if (!notice) return res.status(404).json({ message: 'Notice not found' });
  await markMany(member, [notice._id]);
  res.json({ ok: true });
};

exports.markAllRead = async (req, res) => {
  const member = await Member.findById(req.member._id).select(MEMBER_FIELDS).lean();
  const notices = await noticesFor(member, new Date());
  await markMany(member, notices.map((n) => n._id));
  res.json({ ok: true });
};
