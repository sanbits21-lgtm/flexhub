const { statusFilter, deriveMembershipStatus } = require('./membershipStatus');

const DAY = 86400000;

// Who a notice is for. The same rule is written twice, on purpose and side by side: as a database filter (to count
// "this reaches 214 members" before publishing) and as a check on one member (to build what that member sees). A test
// pins that the two agree, so they cannot drift apart.

/** A Mongo filter for the members an audience covers. Branches are handled separately by `branchFilter`. */
const audienceFilter = (audience = {}, now = new Date()) => {
  switch (audience.type) {
    case 'active': return statusFilter('active', now);
    case 'expired': return { membershipStatus: { $in: ['active', 'expired'] }, membershipEnd: { $lt: now } };
    case 'expiring': return { membershipStatus: 'active', membershipEnd: { $gte: now, $lte: new Date(now.getTime() + (audience.days || 7) * DAY) } };
    case 'plan': return audience.planId ? { membershipPlanId: audience.planId } : { _id: null };
    default: return {};
  }
};

/** The branch part of a notice: no branches listed means every branch. */
const branchFilter = (branchIds = []) => (branchIds.length ? { branchId: { $in: branchIds } } : {});

const inBranches = (branchIds, branchId) => !branchIds?.length || branchIds.some((b) => String(b) === String(branchId));

/** Does this notice reach this member right now? (`member` is a plain or Mongoose member record.) */
const reaches = (notice, member, now = new Date()) => {
  if (!inBranches(notice.branchIds, member.branchId)) return false;
  const a = notice.audience || {};
  const end = member.membershipEnd ? new Date(member.membershipEnd) : null;
  switch (a.type) {
    case 'active': return deriveMembershipStatus(member, now) === 'active';
    case 'expired': return ['active', 'expired'].includes(member.membershipStatus) && !!end && end < now;
    case 'expiring': return member.membershipStatus === 'active' && !!end && end >= now && end <= new Date(now.getTime() + (a.days || 7) * DAY);
    case 'plan': return !!a.planId && String(member.membershipPlanId) === String(a.planId);
    default: return true;
  }
};

// ---- the automatic renewal reminder ----------------------------------------------------------------------------

const DEFAULT_DAYS = [7, 3, 1];
const DEFAULT_EXPIRING = 'Hi {name}, your membership ends on {date} ({days}). Renew at the front desk to keep training without a break.';
const DEFAULT_EXPIRED = 'Hi {name}, your membership ended on {date}. Renew at the front desk to start training again.';

const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
const dateLabel = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * The reminder a member should see right now, or null. Switched on per gym. A member sees the "ending soon" notice once
 * their membership is within the largest of the chosen day counts, and the "ended" notice from the day after it ends.
 * It is worked out on the spot and never stored, so renewing makes it vanish at once.
 */
const renewalReminder = (settings, member, now = new Date()) => {
  if (!settings?.enabled || !member?.membershipEnd) return null;
  if (!['active', 'expired'].includes(member.membershipStatus)) return null;
  const end = new Date(member.membershipEnd);
  const first = (member.name || 'there').split(' ')[0];
  const base = { name: first, date: dateLabel(end) };
  if (end < now) {
    return { id: 'renewal', kind: 'reminder', auto: true, title: 'Your membership has ended', body: fill(settings.expiredText || DEFAULT_EXPIRED, { ...base, days: 'ended' }), at: end };
  }
  const days = (settings.daysBefore?.length ? settings.daysBefore : DEFAULT_DAYS);
  const left = Math.ceil((end - now) / DAY);
  if (left > Math.max(...days)) return null;
  const label = left <= 0 ? 'today' : `${left} day${left === 1 ? '' : 's'} left`;
  return { id: 'renewal', kind: 'reminder', auto: true, title: left <= 0 ? 'Your membership ends today' : 'Your membership ends soon', body: fill(settings.expiringText || DEFAULT_EXPIRING, { ...base, days: label }), at: now };
};

module.exports = { audienceFilter, branchFilter, reaches, renewalReminder, DEFAULT_DAYS, DEFAULT_EXPIRING, DEFAULT_EXPIRED };
