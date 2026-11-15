const crypto = require('crypto');
const Member = require('../models/Member');
const Branch = require('../models/Branch');
const TenantSubscriptionInvoice = require('../models/TenantSubscriptionInvoice');
const { addMonths } = require('./subscription');

// Everything about turning "a gym chose a package" into money owed and, once paid, into a running plan. One place, so the
// amount shown, the amount asked for and the plan applied can never disagree.

const MAX_PERIODS = 12;
const MAX_MONTHS = 60;
const ORDER_HOURS = 48;
const cents = (n) => Math.round(n * 100) / 100;

/** What `periods` billing periods of a package cost: the base, the tax on it, and the total to pay. */
const quote = (pkg, periods, gstPercent = 0) => {
  const base = cents(pkg.price * periods);
  const gst = cents((base * gstPercent) / 100);
  return { periods, months: (pkg.billingMonths || 1) * periods, base, gst, total: cents(base + gst) };
};

/** How many periods of this package fit in the five-year ceiling. */
const maxPeriods = (pkg) => Math.max(1, Math.min(MAX_PERIODS, Math.floor(MAX_MONTHS / (pkg.billingMonths || 1))));

const kindOf = (tenant, pkg) => {
  if (tenant.billingPlan === 'trial') return 'upgrade';
  return String(tenant.packageId) === String(pkg._id) ? 'renewal' : 'change';
};

/** The reference the owner types into the payment note: short, readable aloud, no look-alike characters. */
const newReference = () => {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(6);
  return `FC${[...bytes].map((b) => alphabet[b % alphabet.length]).join('')}`;
};

/** Why a gym cannot move to this package yet, or null: it must not be over the new limits. */
const limitProblem = async (tenant, pkg) => {
  if (pkg.maxMembers) {
    const members = await Member.countDocuments({ tenantId: tenant._id, isActive: true });
    if (members > pkg.maxMembers) return `You have ${members} members and ${pkg.name} allows ${pkg.maxMembers}. Remove some members or choose a bigger package.`;
  }
  const branches = await Branch.countDocuments({ tenantId: tenant._id, isActive: true });
  if (branches > pkg.maxBranches) return `You have ${branches} branches and ${pkg.name} allows ${pkg.maxBranches}. Deactivate some branches or choose a bigger package.`;
  return null;
};

/**
 * Puts a paid order into effect on the gym:
 *   - the same package again extends from the current end (paying early loses nothing; a lapsed plan restarts today);
 *   - a trial becoming paid, or a different package, starts a fresh period today (a switch does not carry the old days);
 *   - a different package also brings its limits.
 * Writes the paid invoice. Returns what changed.
 */
const applyPurchase = async ({ tenant, pkg, months, total, reference, now = new Date() }) => {
  const changing = !tenant.packageId || String(tenant.packageId) !== String(pkg._id);
  const wasTrial = tenant.billingPlan === 'trial';
  const from = !wasTrial && !changing && tenant.planEndsAt && tenant.planEndsAt > now ? tenant.planEndsAt : now;
  const end = addMonths(from, months);

  tenant.planEndsAt = end;
  tenant.expiryNotice = undefined; // the reminder sequence starts again for the new end date
  if (wasTrial || changing) {
    tenant.billingPlan = 'basic';
    tenant.trialEndsAt = undefined;
  }
  if (changing) {
    tenant.packageId = pkg._id;
    tenant.packageName = pkg.name;
    tenant.maxBranches = pkg.maxBranches;
    tenant.maxMembers = pkg.maxMembers ?? undefined;
  }
  if (tenant.billingStatus === 'past_due') tenant.billingStatus = 'active';
  await tenant.save();

  const invoice = await TenantSubscriptionInvoice.create({
    tenantId: tenant._id, billingPlan: pkg.name, periodStart: from, periodEnd: end, amount: total, status: 'paid', gatewayRef: reference,
  });
  return { tenant, invoice, periodStart: from, periodEnd: end };
};

module.exports = { quote, maxPeriods, kindOf, newReference, limitProblem, applyPurchase, ORDER_HOURS, MAX_PERIODS };
