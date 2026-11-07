import { useAuth } from '../context/AuthContext';

const DAY = 86400000;
const date = (d) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const tone = (level) => ({
  red: 'bg-red-900/40 text-red-200 border-b border-red-800',
  amber: 'bg-amber-400/15 text-amber-700 dark:text-amber-300 border-b border-amber-500/30',
  info: 'bg-accent/15 text-gray-800 dark:text-gray-100 border-b border-accent/30',
}[level]);

/** Tells a gym owner where they stand on the free trial or the paid plan. Nothing when there is nothing to say. */
export default function TrialBanner() {
  const { user, subscription } = useAuth();
  if (!subscription || user?.role === 'trainer') return null;

  let message; let level;
  if (subscription.onTrial) {
    const { trialExpired, daysLeft, maxMembers } = subscription;
    level = trialExpired ? 'red' : daysLeft <= 3 ? 'amber' : 'info';
    message = trialExpired
      ? 'Your free trial has ended. You can still view your data, but changes are paused. Contact us to choose a plan.'
      : `Free trial: ${daysLeft} day${daysLeft === 1 ? '' : 's'} left${maxMembers ? ` · up to ${maxMembers} members` : ''}.`;
  } else if (subscription.planEndsAt) {
    const { planExpired, planLocked, planDaysLeft, planEndsAt, graceDays, packageName } = subscription;
    if (!planExpired && planDaysLeft > 7) return null; // nothing to say until it is close
    const name = packageName ? `${packageName} plan` : 'plan';
    if (planLocked) {
      level = 'red';
      message = `Your subscription ended on ${date(planEndsAt)}. You can still view your data, but changes are paused. Contact us to renew.`;
    } else if (planExpired) {
      const left = Math.max(1, Math.ceil((new Date(planEndsAt).getTime() + graceDays * DAY - Date.now()) / DAY));
      level = 'amber';
      message = `Your ${name} ended on ${date(planEndsAt)}. Everything works for ${left} more day${left === 1 ? '' : 's'}, then changes are paused. Contact us to renew.`;
    } else {
      level = planDaysLeft <= 3 ? 'amber' : 'info';
      message = `Your ${name} ends on ${date(planEndsAt)} (${planDaysLeft} day${planDaysLeft === 1 ? '' : 's'} left). Contact us to renew.`;
    }
  } else {
    return null;
  }
  return <div role="status" className={`px-4 py-2 text-sm font-medium ${tone(level)}`}>{message}</div>;
}
