const mongoose = require('mongoose');
const Member = require('../models/Member');
const MembershipPlan = require('../models/MembershipPlan');
const Attendance = require('../models/Attendance');
const Equipment = require('../models/Equipment');
const { statusFilter } = require('../utils/membershipStatus');

// Tenant-wide (or single-branch, when req.scope.branchId is set via ?branchId=) report
// bundle — plan mix, 30-day attendance trend, equipment health. One call, same
// branch-drill-down mechanism the dashboard already uses.
exports.getSummary = async (req, res) => {
  const match = { tenantId: new mongoose.Types.ObjectId(req.scope.tenantId) };
  if (req.scope.branchId) match.branchId = new mongoose.Types.ObjectId(req.scope.branchId);

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [planMixAgg, attendanceAgg, equipmentStatusAgg, equipmentOverdue] = await Promise.all([
    Member.aggregate([
      // isActive: deactivated members are soft-deleted and must not inflate plan mix
      // or the monthly value derived from it.
      // statusFilter: a membership past its end date is no longer part of the plan mix.
      { $match: { $and: [{ ...match, isActive: true, membershipPlanId: { $ne: null } }, statusFilter('active')] } },
      { $group: { _id: '$membershipPlanId', count: { $sum: 1 } } },
    ]),
    Attendance.aggregate([
      { $match: { ...match, checkInAt: { $gte: thirtyDaysAgo } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$checkInAt' } }, count: { $sum: 1 } } },
    ]),
    Equipment.aggregate([
      { $match: match },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Equipment.find({ ...match, nextServiceDue: { $lte: new Date() } })
      .select('name category branchId nextServiceDue').sort({ nextServiceDue: 1 }).limit(20),
  ]);

  const plans = await MembershipPlan.find({ _id: { $in: planMixAgg.map((p) => p._id) } }).select('name price');
  const planMix = planMixAgg
    .map((p) => {
      const plan = plans.find((pl) => pl._id.equals(p._id));
      return { planId: p._id, planName: plan?.name || 'Unknown plan', activeMembers: p.count, monthlyValue: (plan?.price || 0) * p.count };
    })
    .sort((a, b) => b.activeMembers - a.activeMembers);

  // Zero-fill the last 30 days so the chart has no gaps on days with no check-ins.
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (29 - i));
    return d.toISOString().slice(0, 10);
  });
  const attendanceTrend = days.map((day) => ({
    date: day.slice(5),
    count: attendanceAgg.find((a) => a._id === day)?.count || 0,
  }));

  const equipmentByStatus = ['operational', 'under_maintenance', 'retired'].map((status) => ({
    status,
    count: equipmentStatusAgg.find((e) => e._id === status)?.count || 0,
  }));

  res.json({ planMix, attendanceTrend, equipmentByStatus, equipmentOverdue });
};
