import { memberApi } from '../api';
import { useLoad } from '../useLoad';
import { Card, EmptyState, Initials, LoadState, Loading, Muted, Pill, Row, Screen, Section } from '../ui';
import { cap } from '../format';

export default function Gym() {
  const { data, loading, error, stale, reload } = useLoad('gym', async () => {
    // A gym can switch the equipment list off; that must not blank the trainers list.
    const [equipment, trainers] = await Promise.all([
      memberApi.get('/member-app/equipment').then((r) => r.data).catch(() => null),
      memberApi.get('/member-app/trainers').then((r) => r.data),
    ]);
    return { equipment, ...trainers };
  });

  if (loading) return <Loading />;
  const byCategory = new Map();
  (data?.equipment ?? []).forEach((e) => { const k = e.category || 'Other'; byCategory.set(k, [...(byCategory.get(k) ?? []), e]); });

  return (
    <Screen title="My gym" subtitle="Trainers & equipment">
      <LoadState error={error} stale={stale} onRetry={reload} />

      <Section title="Trainers" />
      <Card className="py-1">
        {data?.trainers?.length ? data.trainers.map((t, i) => (
          <div key={t._id} className={`flex items-center gap-3 py-3 ${i === data.trainers.length - 1 ? '' : 'border-b border-gray-100 dark:border-gray-700'}`}>
            <Initials name={t.name} size={44} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{t.name}</p>
              {t.specialization ? <Muted>{t.specialization}</Muted> : null}
            </div>
            {t._id === data.assignedTrainerId ? <Pill tone="accent">Your trainer</Pill> : null}
          </div>
        )) : <EmptyState title="No trainers listed yet" />}
      </Card>

      <Section title="Equipment" />
      {data?.equipment === null && <Card><Muted>Your gym has not turned on the equipment list.</Muted></Card>}
      {data?.equipment?.length === 0 && <Card><EmptyState title="No equipment listed yet" /></Card>}
      {[...byCategory.entries()].map(([category, items]) => (
        <Card key={category} className="py-2">
          <p className="text-xs font-extrabold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">{category}</p>
          {items.map((e, i) => (
            <Row key={e._id} title={e.name} right={<Pill tone={e.status === 'operational' ? 'success' : 'warn'}>{e.status === 'operational' ? 'Available' : cap(e.status)}</Pill>} last={i === items.length - 1} />
          ))}
        </Card>
      ))}
    </Screen>
  );
}
