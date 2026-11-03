import { useAuth } from '../context/AuthContext';

/** Tells a gym owner where they stand on the free trial. Nothing for paid or platform-created gyms. */
export default function TrialBanner() {
  const { user, subscription } = useAuth();
  if (!subscription?.onTrial || user?.role === 'trainer') return null;
  const { trialExpired, daysLeft, maxMembers } = subscription;
  const urgent = trialExpired || daysLeft <= 3;
  return (
    <div role="status" className={`px-4 py-2 text-sm font-medium ${trialExpired ? 'bg-red-900/40 text-red-200 border-b border-red-800' : urgent ? 'bg-amber-400/15 text-amber-700 dark:text-amber-300 border-b border-amber-500/30' : 'bg-accent/15 text-gray-800 dark:text-gray-100 border-b border-accent/30'}`}>
      {trialExpired
        ? 'Your free trial has ended. You can still view your data, but changes are paused. Contact us to choose a plan.'
        : `Free trial: ${daysLeft} day${daysLeft === 1 ? '' : 's'} left${maxMembers ? ` · up to ${maxMembers} members` : ''}.`}
    </div>
  );
}
