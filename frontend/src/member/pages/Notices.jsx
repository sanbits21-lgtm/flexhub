import { useState } from 'react';
import { memberApi } from '../api';
import { useLoad } from '../useLoad';
import { Btn, Card, EmptyState, LoadState, Loading, Pill, Screen } from '../ui';

const KIND = { news: ['News', 'info'], offer: ['Offer', 'success'], notice: ['Notice', 'neutral'], reminder: ['Reminder', 'warn'] };
const when = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

// What the gym has told this member: news and offers from the owner or branch manager, and the automatic renewal reminder.
export default function Notices() {
  const { data, error, stale, loading, reload } = useLoad('notices', () => memberApi.get('/member-app/notices').then((r) => r.data));
  const [busy, setBusy] = useState(false);

  const open = async (item) => {
    if (item.read || item.auto) return;
    await memberApi.post(`/member-app/notices/${item.id}/read`, {}).catch(() => {});
    reload();
  };
  const readAll = async () => {
    setBusy(true);
    await memberApi.post('/member-app/notices/read-all', {}).catch(() => {});
    await reload();
    setBusy(false);
  };

  if (loading) return <Loading />;
  const items = data?.items ?? [];
  const unread = items.filter((i) => !i.read && !i.auto).length;

  return (
    <Screen title="Notices" subtitle={data ? (unread ? `${unread} new` : 'All caught up') : ''} right={unread > 0 ? <Btn kind="secondary" small busy={busy} onClick={readAll}>Mark all read</Btn> : null}>
      <LoadState error={error} stale={stale} onRetry={reload} />
      {items.length === 0 && !error && <EmptyState title="No notices" text="News and offers from your gym will show up here." />}
      <div className="space-y-3">
        {items.map((n) => {
          const [label, tone] = KIND[n.kind] || KIND.notice;
          return (
            <Card key={n.id} onClick={() => open(n)} className={!n.read && !n.auto ? 'ring-2 ring-accent/60' : ''}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2"><Pill tone={tone}>{label}</Pill>{!n.read && !n.auto && <span className="h-2 w-2 rounded-full bg-accent" aria-label="Unread" />}</div>
                {!n.auto && <span className="text-xs text-gray-500 dark:text-gray-400">{when(n.at)}</span>}
              </div>
              <h2 className="mt-2 font-bold text-gray-900 dark:text-gray-100">{n.title}</h2>
              <p className="mt-1 whitespace-pre-line text-sm text-gray-700 dark:text-gray-300">{n.body}</p>
              {n.link && <a href={n.link} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm font-semibold text-green-700 underline dark:text-accent">Open link</a>}
            </Card>
          );
        })}
      </div>
    </Screen>
  );
}
