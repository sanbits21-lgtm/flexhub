const mongoose = require('mongoose');
const Tenant = require('../models/Tenant');
const Branch = require('../models/Branch');
const Member = require('../models/Member');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const MemberPayment = require('../models/MemberPayment');
const { statusFilter } = require('../utils/membershipStatus');
const Equipment = require('../models/Equipment');
const TenantSubscriptionInvoice = require('../models/TenantSubscriptionInvoice');
const Booking = require('../models/Booking');
const MembershipPlan = require('../models/MembershipPlan');
const ClassSession = require('../models/ClassSession');
const ClassType = require('../models/ClassType');

const startOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
};

// Chronological list of the last n month buckets (oldest first), each with a
// Mongo-groupable '%Y-%m' key and a short display label for chart axes.
const lastNMonths = (n) => {
  const start = startOfMonth();
  return Array.from({ length: n }, (_, i) => {
    const m = new Date(start.getFullYear(), start.getMonth() - (n - 1 - i), 1);
    return {
      key: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`,
      label: m.toLocaleString('en-US', { month: 'short', year: '2-digit' }),
    };
  });
};

const platformSummary = async () => {
  const [tenantsByPlan, totalTenants, activeTenants, mrrAgg] = await Promise.all([
    Tenant.aggregate([{ $group: { _id: '$billingPlan', count: { $sum: 1 } } }]),
    Tenant.countDocuments(),
    Tenant.countDocuments({ isActive: true }),
    TenantSubscriptionInvoice.aggregate([
      { $match: { status: 'paid', periodStart: { $gte: startOfMonth() } } },
      { $group: { _id: null, mrr: { $sum: '$amount' } } },
    ]),
  ]);
  return {
    totalTenants,
    activeTenants,
    tenantsByPlan,
    mrr: mrrAgg[0]?.mrr || 0,
  };
};

// The class side of the dashboard: bookings made this month (and the last six months, for the card's sparkline),
// the next few scheduled sessions with how full they are, and the activities the gym offers. `match` carries the
// tenant, and the branch when one is selected. All of it is empty for a gym that does not run classes.
const classInsights = async (match, months) => {
  const now = new Date();
  const windowStart = new Date(months[0].key + '-01');
  const live = { $in: ['booked', 'attended'] };
  const typeMatch = { tenantId: match.tenantId, isActive: true };
  if (match.branchId) typeMatch.$or = [{ branchId: null }, { branchId: match.branchId }];

  const [bookingsAgg, upcoming, types] = await Promise.all([
    Booking.aggregate([
      { $match: { ...match, status: live, bookedAt: { $gte: windowStart } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$bookedAt' } }, count: { $sum: 1 } } },
    ]),
    ClassSession.find({ ...match, status: 'scheduled', startAt: { $gte: now } })
      .sort({ startAt: 1 }).limit(4).populate('classTypeId', 'name').populate('branchId', 'name').lean(),
    ClassType.find(typeMatch).select('name').sort({ name: 1 }).limit(6).lean(),
  ]);

  const counts = upcoming.length
    ? await Booking.aggregate([
      { $match: { tenantId: match.tenantId, classSessionId: { $in: upcoming.map((u) => u._id) }, status: live } },
      { $group: { _id: '$classSessionId', count: { $sum: 1 } } },
    ])
    : [];

  const bookingsByMonth = months.map((m) => ({ month: m.label, count: bookingsAgg.find((x) => x._id === m.key)?.count || 0 }));
  return {
    bookingsThisMonth: bookingsByMonth[bookingsByMonth.length - 1].count,
    bookingsByMonth,
    upcomingSessions: upcoming.map((u) => ({
      id: u._id,
      name: u.classTypeId?.name || 'Class',
      branchName: u.branchId?.name || '',
      startAt: u.startAt,
      endAt: u.endAt,
      capacity: u.capacity,
      booked: counts.find((c) => c._id.equals(u._id))?.count || 0,
    })),
    activities: types.map((c) => ({ id: c._id, name: c.name })),
  };
};

// Which membership plans are selling. A paid payment tied to a plan is one sale of it (a new member or a renewal), so this
// counts those per plan for each of the last six months, against how many active members are on the plan today.
// `match` carries the tenant, and the branch when one is selected.
const plansTrending = async (match, months, now) => {
  const windowStart = new Date(months[0].key + '-01');
  const [sales, active] = await Promise.all([
    MemberPayment.aggregate([
      { $match: { ...match, status: 'paid', membershipPlanId: { $ne: null }, paidAt: { $gte: windowStart } } },
      { $group: { _id: { plan: '$membershipPlanId', month: { $dateToString: { format: '%Y-%m', date: '$paidAt' } } }, count: { $sum: 1 }, amount: { $sum: '$amount' } } },
    ]),
    Member.aggregate([
      { $match: { ...match, isActive: true, membershipPlanId: { $ne: null }, ...statusFilter('active', now) } },
      { $group: { _id: '$membershipPlanId', n: { $sum: 1 } } },
    ]),
  ]);
  const ids = [...new Set([...sales.map((s) => String(s._id.plan)), ...active.map((a) => String(a._id))])];
  if (!ids.length) return [];
  const plans = await MembershipPlan.find({ _id: { $in: ids }, tenantId: match.tenantId }).select('name').lean();
  const [cur, prev] = [months[months.length - 1].key, months[months.length - 2].key];
  return plans.map((p) => {
    const at = (key) => sales.find((s) => String(s._id.plan) === String(p._id) && s._id.month === key);
    const thisMonth = at(cur)?.count || 0;
    const lastMonth = at(prev)?.count || 0;
    return {
      planId: p._id,
      name: p.name,
      thisMonth,
      lastMonth,
      change: lastMonth ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : null, // null: nothing last month to compare with
      isNew: !lastMonth && thisMonth > 0,
      revenueThisMonth: at(cur)?.amount || 0,
      activeMembers: active.find((a) => String(a._id) === String(p._id))?.n || 0,
      series: months.map((m) => at(m.key)?.count || 0),
    };
  })
    .sort((a, b) => b.thisMonth - a.thisMonth || b.activeMembers - a.activeMembers || a.name.localeCompare(b.name))
    .slice(0, 5);
};

// Tenant Admin's aggregated (or branch drill-down, when req.scope.branchId is set) dashboard.
const tenantSummary = async (scope) => {
  const match = { tenantId: new mongoose.Types.ObjectId(scope.tenantId) };
  if (scope.branchId) match.branchId = new mongoose.Types.ObjectId(scope.branchId);

  const branchMatch = { tenantId: match.tenantId, isActive: true };
  if (match.branchId) branchMatch._id = match.branchId;
  const branches = await Branch.find(branchMatch).select('name').sort({ name: 1 });
  const branchIds = branches.map((b) => b._id);

  const months = lastNMonths(6);
  const monthWindowStart = new Date(months[0].key + '-01');

  // "Expired" is derived live from membershipEnd, not the manually-set membershipStatus
  // field, so it stays correct even if a branch-manager never flips a lapsed member's
  // status. frozen/cancelled members are excluded — they're intentionally paused or
  // terminated, not lapsed.
  const now = new Date();
  const soonWindow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  // Deactivated members are soft-deleted and must not inflate counts or show up in
  // renewal chases. Only Member queries get this — MemberPayment/Attendance/Equipment
  // have no isActive field, so reusing it there would match nothing.
  const memberMatch = { ...match, isActive: true };
  const lapseTrackMatch = { ...memberMatch, membershipStatus: { $in: ['active', 'expired'] } };
  // membershipPlanId is included so the dashboard's Renew action can pre-select the
  // member's current plan without a second fetch.
  const memberListFields = 'name phone memberCode membershipEnd branchId membershipPlanId';

  const [
    activeMembers, revenueAgg, attendanceTrend, memberCounts, equipmentCounts, trainerCounts,
    membersByMonthAgg, collectionsByMonthAgg,
    expiredCount, expiringSoonCount, expiredMembers, expiringSoonMembers,
  ] = await Promise.all([
    // Active = not lapsed: the stored status alone still reads 'active' after the end date passes.
    Member.countDocuments({ $and: [memberMatch, statusFilter('active', now)] }),
    MemberPayment.aggregate([
      { $match: { ...match, status: 'paid', paidAt: { $gte: startOfMonth() } } },
      { $group: { _id: null, revenue: { $sum: '$amount' } } },
    ]),
    Attendance.aggregate([
      { $match: { ...match, checkInAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$checkInAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    // Grouped over every branch (not just match) so branches with zero members still show up.
    Member.aggregate([
      { $match: { tenantId: match.tenantId, branchId: { $in: branchIds }, isActive: true } },
      { $group: { _id: '$branchId', activeMembers: { $sum: { $cond: [{ $and: [{ $eq: ['$membershipStatus', 'active'] }, { $gte: [{ $ifNull: ['$membershipEnd', now] }, now] }] }, 1, 0] } }, total: { $sum: 1 } } },
    ]),
    Equipment.aggregate([
      { $match: { tenantId: match.tenantId, branchId: { $in: branchIds } } },
      { $group: { _id: '$branchId', count: { $sum: 1 } } },
    ]),
    User.aggregate([
      { $match: { tenantId: match.tenantId, branchId: { $in: branchIds }, role: 'trainer' } },
      { $group: { _id: '$branchId', count: { $sum: 1 } } },
    ]),
    Member.aggregate([
      { $match: { ...memberMatch, createdAt: { $gte: monthWindowStart } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, count: { $sum: 1 } } },
    ]),
    MemberPayment.aggregate([
      { $match: { ...match, status: 'paid', paidAt: { $gte: monthWindowStart } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$paidAt' } }, amount: { $sum: '$amount' } } },
    ]),
    Member.countDocuments({ ...lapseTrackMatch, membershipEnd: { $lt: now } }),
    Member.countDocuments({ ...lapseTrackMatch, membershipEnd: { $gte: now, $lte: soonWindow } }),
    Member.find({ ...lapseTrackMatch, membershipEnd: { $lt: now } }).select(memberListFields).sort({ membershipEnd: -1 }).limit(20),
    Member.find({ ...lapseTrackMatch, membershipEnd: { $gte: now, $lte: soonWindow } }).select(memberListFields).sort({ membershipEnd: 1 }).limit(20),
  ]);

  const insights = await classInsights(match, months);
  const trending = await plansTrending(match, months, now);
  const membersByMonth = months.map((m) => ({
    month: m.label,
    count: membersByMonthAgg.find((x) => x._id === m.key)?.count || 0,
  }));
  const collectionsByMonth = months.map((m) => ({
    month: m.label,
    amount: collectionsByMonthAgg.find((x) => x._id === m.key)?.amount || 0,
  }));

  const perBranch = branches.map((b) => {
    const m = memberCounts.find((x) => x._id.equals(b._id));
    const e = equipmentCounts.find((x) => x._id.equals(b._id));
    const t = trainerCounts.find((x) => x._id.equals(b._id));
    return {
      branchId: b._id,
      branchName: b.name,
      activeMembers: m?.activeMembers || 0,
      totalMembers: m?.total || 0,
      equipmentCount: e?.count || 0,
      trainerCount: t?.count || 0,
    };
  });

  return {
    ...insights,
    plansTrending: trending,
    activeMembers,
    revenueThisMonth: revenueAgg[0]?.revenue || 0,
    attendanceTrend,
    perBranch,
    branchCount: branches.length,
    membersByMonth,
    collectionsByMonth,
    expiredCount,
    expiringSoonCount,
    expiredMembers,
    expiringSoonMembers,
  };
};

const branchSummary = async (scope) => {
  const match = { tenantId: new mongoose.Types.ObjectId(scope.tenantId), branchId: new mongoose.Types.ObjectId(scope.branchId) };
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

  // Same live-from-date definition as tenantSummary — see comment there.
  const now = new Date();
  const soonWindow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const memberMatch = { ...match, isActive: true };
  const lapseTrackMatch = { ...memberMatch, membershipStatus: { $in: ['active', 'expired'] } };
  const memberListFields = 'name phone memberCode membershipEnd membershipPlanId';

  const [
    activeMembers, todaysCheckins, expiringSoon, maintenanceDue, revenueAgg,
    expiredCount, expiredMembers, expiringSoonMembers,
  ] = await Promise.all([
    Member.countDocuments({ $and: [memberMatch, statusFilter('active', now)] }),
    Attendance.countDocuments({ ...match, checkInAt: { $gte: todayStart } }),
    Member.countDocuments({ ...lapseTrackMatch, membershipEnd: { $gte: now, $lte: soonWindow } }),
    Equipment.countDocuments({ ...match, nextServiceDue: { $lte: new Date() } }),
    MemberPayment.aggregate([
      { $match: { ...match, status: 'paid', paidAt: { $gte: startOfMonth() } } },
      { $group: { _id: null, revenue: { $sum: '$amount' } } },
    ]),
    Member.countDocuments({ ...lapseTrackMatch, membershipEnd: { $lt: now } }),
    Member.find({ ...lapseTrackMatch, membershipEnd: { $lt: now } }).select(memberListFields).sort({ membershipEnd: -1 }).limit(20),
    Member.find({ ...lapseTrackMatch, membershipEnd: { $gte: now, $lte: soonWindow } }).select(memberListFields).sort({ membershipEnd: 1 }).limit(20),
  ]);

  const insights = await classInsights(match, lastNMonths(6));
  return {
    ...insights,
    activeMembers,
    todaysCheckins,
    expiringSoon,
    maintenanceDue,
    revenueThisMonth: revenueAgg[0]?.revenue || 0,
    expiredCount,
    expiredMembers,
    expiringSoonMembers,
  };
};

const trainerSummary = async (req) => {
  // Member.assignedTrainerId is the actual relationship — User.assignedMembers was never
  // written anywhere and always empty; querying it here silently broke every trainer's
  // dashboard.
  const assignedMembers = await Member.find({ assignedTrainerId: req.user._id }).select('_id');
  const assignedMemberIds = assignedMembers.map((m) => m._id);
  const lowAttendance = await Attendance.aggregate([
    { $match: { memberId: { $in: assignedMemberIds }, checkInAt: { $gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) } } },
    { $group: { _id: '$memberId', visits: { $sum: 1 } } },
  ]);
  const lowAttendanceIds = assignedMemberIds.filter(
    (id) => !lowAttendance.some((r) => r._id.toString() === id.toString() && r.visits >= 3)
  );
  return { assignedMemberCount: assignedMemberIds.length, lowAttendanceMemberIds: lowAttendanceIds };
};

const memberSummary = async (member) => {
  const [attendanceCount, latestPayment] = await Promise.all([
    Attendance.countDocuments({ memberId: member._id, checkInAt: { $gte: startOfMonth() } }),
    MemberPayment.findOne({ memberId: member._id }).sort({ createdAt: -1 }),
  ]);
  return {
    membershipStatus: member.membershipStatus,
    membershipEnd: member.membershipEnd,
    attendanceThisMonth: attendanceCount,
    latestBodyMetric: member.bodyMetrics?.[member.bodyMetrics.length - 1] || null,
    latestPayment,
  };
};

exports.getSummary = async (req, res) => {
  if (req.actorType === 'member') {
    return res.json(await memberSummary(req.member));
  }
  switch (req.user.role) {
    case 'super-admin':
    case 'platform-admin':
      return res.json(await platformSummary());
    case 'tenant-admin':
      return res.json(await tenantSummary(req.scope));
    case 'branch-manager':
      return res.json(await branchSummary(req.scope));
    case 'trainer':
      return res.json(await trainerSummary(req));
    default:
      return res.status(403).json({ message: 'Unknown role' });
  }
};

exports.getPlatform = async (req, res) => {
  res.json(await platformSummary());
};
