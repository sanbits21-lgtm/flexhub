import { useFeature } from '../hooks/useFeature';

// Wraps a page's content INSIDE AppLayout (not the other way round) — e.g.
// <AppLayout><FeatureRoute feature="pages:reports"><Reports /></FeatureRoute></AppLayout>
// in App.jsx. That composition matters: the sidebar/header keep rendering around the
// message, so the nav link stays visible and clickable rather than vanishing. Unlike
// RoleRoute's silent redirect on a role mismatch, a disabled feature explains itself —
// "you can see it exists, here's why you can't use it" rather than the item just
// disappearing.
export default function FeatureRoute({ feature, children }) {
  const enabled = useFeature(feature);
  if (enabled) return children;

  return (
    <div className="p-6 flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-sm">
        <p className="text-lg font-medium text-gray-900 dark:text-gray-100">Not included in your plan</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
          This feature isn't enabled for your gym. Contact support to enable it.
        </p>
      </div>
    </div>
  );
}
