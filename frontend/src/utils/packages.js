const COMMON = { 1: 'month', 3: 'quarter', 6: '6 months', 12: 'year' };

/** Billing periods offered as one-tap choices; anything else is typed as a number of months. */
export const BILLING_PRESETS = [[1, 'Monthly'], [3, 'Quarterly'], [6, 'Every 6 months'], [12, 'Yearly']];

const period = (months) => COMMON[months] || `${months} months`;

/** "Free", or "₹999 / month". */
export const priceLabel = (p) => (Number(p.price) > 0 ? `₹${Number(p.price).toLocaleString('en-IN')} / ${period(p.billingMonths || 1)}` : 'Free');

/** "14-day free trial" or "Live from approval". */
export const trialLabel = (p) => (p.trialDays > 0 ? `${p.trialDays}-day free trial` : 'Live from approval');

/** "Up to 2 branches · 100 members". */
export const limitsLabel = (p) => `Up to ${p.maxBranches} branch${p.maxBranches === 1 ? '' : 'es'} · ${p.maxMembers ? `${p.maxMembers.toLocaleString('en-IN')} members` : 'unlimited members'}`;
