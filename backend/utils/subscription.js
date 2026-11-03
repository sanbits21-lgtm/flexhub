const Member = require('../models/Member');

const DAY = 86400000;

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

/**
 * What the website needs to know about a gym's plan. A trial with no end date (every gym
 * created by platform staff before self-signup existed) never expires.
 */
const subscriptionOf = (tenant, now = new Date()) => {
  const onTrial = tenant.billingPlan === 'trial' && !!tenant.trialEndsAt;
  const msLeft = onTrial ? tenant.trialEndsAt.getTime() - now.getTime() : null;
  return {
    plan: tenant.billingPlan,
    onTrial,
    trialEndsAt: onTrial ? tenant.trialEndsAt : null,
    trialExpired: onTrial && msLeft <= 0,
    daysLeft: onTrial ? Math.max(0, Math.ceil(msLeft / DAY)) : null,
    maxMembers: tenant.maxMembers || null,
    maxBranches: tenant.maxBranches,
  };
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

module.exports = { approvalBlock, subscriptionOf, memberRoom, DAY };
