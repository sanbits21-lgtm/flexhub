const Member = require('../models/Member');

const DAY = 86400000;
// A paid plan that has run out keeps working for this long (owners see a warning) before the
// gym goes read-only, so a late payment does not stop a gym mid-class. Trials get no grace.
const GRACE_DAYS = 3;

// Why a gym that has not been approved cannot be used yet; null once it can.
const approvalBlock = (tenant) => {
  if (tenant.approvalStatus === 'pending') {
    return { status: 403, code: 'PENDING_APPROVAL', message: 'Your gym is waiting for approval by our team. We will email you as soon as it is ready.' };
  }
  if (tenant.approvalStatus === 'rejected') {
    return { status: 403, code: 'REJECTED', message: 'Your registration was not approved. Please contact support.' };
  }
  return null;
};

/** `date` plus whole months, clamped to the month's last day (31 Jan + 1 month = 28/29 Feb, not 3 Mar). */
const addMonths = (date, months) => {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
};

const onTrial = (tenant) => tenant.billingPlan === 'trial' && !!tenant.trialEndsAt;

/**
 * When the gym's current period ends: the trial end for a trial, the plan end for a paid plan.
 * Null for a gym with no end date (created by platform staff, never expires).
 */
const endOf = (tenant) => (tenant.billingPlan === 'trial' ? tenant.trialEndsAt : tenant.planEndsAt) || null;

/** Whole days until `end` (rounded up), negative once passed. */
const daysUntil = (end, now = new Date()) => Math.ceil((new Date(end).getTime() - now.getTime()) / DAY);

/**
 * What the website needs to know about a gym's plan. A trial with no end date (every gym
 * created by platform staff before self-signup existed) never expires.
 */
const subscriptionOf = (tenant, now = new Date()) => {
  const trial = onTrial(tenant);
  const msLeft = trial ? tenant.trialEndsAt.getTime() - now.getTime() : null;
  const paid = tenant.billingPlan !== 'trial' && !!tenant.planEndsAt;
  const planLeft = paid ? daysUntil(tenant.planEndsAt, now) : null;
  return {
    plan: tenant.billingPlan,
    packageName: tenant.packageName || null,
    onTrial: trial,
    trialEndsAt: trial ? tenant.trialEndsAt : null,
    trialExpired: trial && msLeft <= 0,
    daysLeft: trial ? Math.max(0, Math.ceil(msLeft / DAY)) : null,
    planEndsAt: paid ? tenant.planEndsAt : null,
    planDaysLeft: paid ? Math.max(0, planLeft) : null,
    planExpired: paid && planLeft <= 0,
    planLocked: paid && now.getTime() >= tenant.planEndsAt.getTime() + GRACE_DAYS * DAY,
    graceDays: GRACE_DAYS,
    maxMembers: tenant.maxMembers || null,
    maxBranches: tenant.maxBranches,
  };
};

/** The write lock a gym is under because its trial or paid plan ran out; null while it may change data. */
const expiryBlock = (tenant, now = new Date()) => {
  const s = subscriptionOf(tenant, now);
  if (s.trialExpired) {
    return { status: 402, code: 'TRIAL_ENDED', message: 'Your free trial has ended. You can still view your data. Contact us to choose a plan and continue.' };
  }
  if (s.planLocked) {
    return { status: 402, code: 'PLAN_EXPIRED', message: 'Your subscription has ended. You can still view your data. Contact us to renew and continue.' };
  }
  return null;
};

/**
 * How many more members this gym may add; Infinity when uncapped. Counts everyone who
 * is not deactivated, so removing a member frees a slot.
 */
const memberRoom = async (tenant) => {
  if (!tenant.maxMembers) return Infinity;
  const used = await Member.countDocuments({ tenantId: tenant._id, isActive: true });
  return Math.max(0, tenant.maxMembers - used);
};

module.exports = { approvalBlock, subscriptionOf, expiryBlock, endOf, daysUntil, addMonths, memberRoom, DAY, GRACE_DAYS };
