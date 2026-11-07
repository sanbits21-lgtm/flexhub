const CYCLE = { monthly: 'month', quarterly: 'quarter', yearly: 'year' };

export const CYCLES = [['monthly', 'Monthly'], ['quarterly', 'Quarterly'], ['yearly', 'Yearly']];

/** "Free", or "₹999 / month". */
export const priceLabel = (p) => (Number(p.price) > 0 ? `₹${Number(p.price).toLocaleString('en-IN')} / ${CYCLE[p.billingCycle] || 'month'}` : 'Free');

/** "14-day free trial" or "Live from approval". */
export const trialLabel = (p) => (p.trialDays > 0 ? `${p.trialDays}-day free trial` : 'Live from approval');

/** "Up to 2 branches · 100 members". */
export const limitsLabel = (p) => `Up to ${p.maxBranches} branch${p.maxBranches === 1 ? '' : 'es'} · ${p.maxMembers ? `${p.maxMembers.toLocaleString('en-IN')} members` : 'unlimited members'}`;
