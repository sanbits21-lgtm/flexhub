import { useState } from 'react';
import { Link } from 'react-router-dom';
import { memberApi, errorText } from '../api';
import { useLoad } from '../useLoad';
import { Btn, Card, Choice, EmptyState, ErrorText, LoadState, Loading, Muted, Pill, Screen, Stat } from '../ui';
import { fmtDate } from '../format';

function WorkoutBody({ plan }) {
  return (
    <>
      {plan.days.map((d) => (
        <Card key={d.day} className="space-y-1">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-lg font-extrabold text-gray-900 dark:text-gray-100">{d.focus}</h3>
            <Pill tone="accent">{d.day}</Pill>
          </div>
          {d.exercises.map((e, i) => (
            <div key={`${e.name}-${i}`} className="flex items-center gap-3 py-2.5 border-t border-gray-100 dark:border-gray-700">
              <div className="min-w-16 text-center rounded-xl bg-gray-100 dark:bg-gray-700 py-1.5 font-extrabold text-gray-900 dark:text-gray-100">{e.sets} x {e.reps}</div>
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 dark:text-gray-100">{e.name}</p>
                <Muted>{[e.equipment, e.restSec ? `rest ${e.restSec}s` : '', e.notes].filter(Boolean).join(' | ')}</Muted>
              </div>
            </div>
          ))}
        </Card>
      ))}
      {plan.notes?.length > 0 && (
        <Card>
          <p className="font-bold text-gray-900 dark:text-gray-100 mb-1">Good to know</p>
          {plan.notes.map((n) => <Muted key={n}>- {n}</Muted>)}
        </Card>
      )}
    </>
  );
}

function DietBody({ plan }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Calories / day" value={plan.caloriesTarget} tone="accent" />
        <Stat label="Protein / day" value={`${plan.proteinG} g`} />
      </div>
      {plan.meals.map((m) => (
        <Card key={m.name} className="space-y-1">
          <div className="flex items-baseline justify-between">
            <h3 className="text-lg font-extrabold text-gray-900 dark:text-gray-100">{m.name}</h3>
            <span className="font-bold text-blue-600 dark:text-accent">{m.calories} kcal</span>
          </div>
          {m.items.map((item) => <p key={item} className="text-gray-900 dark:text-gray-100">•  {item}</p>)}
        </Card>
      ))}
      {plan.tips?.length > 0 && (
        <Card>
          <p className="font-bold text-gray-900 dark:text-gray-100 mb-1">Tips</p>
          {plan.tips.map((t) => <Muted key={t}>- {t}</Muted>)}
        </Card>
      )}
    </>
  );
}

// Workout and Diet share one screen. Two sections: the plan a trainer or the manager wrote for
// this member (first, it is the one to follow), and the plan the member makes themselves.
export default function Plans({ type }) {
  const isWorkout = type === 'workout';
  const noun = isWorkout ? 'workout plan' : 'diet plan';
  const { data, loading, error, stale, reload, setData } = useLoad('plans', () => memberApi.get('/member-app/plans').then((r) => r.data));
  const [days, setDays] = useState(3);
  const [busy, setBusy] = useState(false);
  const [genError, setGenError] = useState('');

  if (loading) return <Loading />;
  const stored = data?.[type] ?? null;
  const assigned = data?.[isWorkout ? 'assignedWorkout' : 'assignedDiet'] ?? null;
  const Body = isWorkout ? WorkoutBody : DietBody;

  const generate = async () => {
    setBusy(true);
    setGenError('');
    try {
      const res = await memberApi.post('/member-app/plans/generate', { type, daysPerWeek: isWorkout ? days : undefined });
      setData((prev) => ({ workout: null, diet: null, assignedWorkout: null, assignedDiet: null, ...(prev || {}), [type]: res.data }));
    } catch (err) {
      setGenError(errorText(err, 'Could not create a plan.'));
    } finally {
      setBusy(false);
    }
  };

  const view = (plan, pill) => (
    <>
      <Card className="space-y-2">
        {pill}
        <h2 className="text-2xl font-extrabold tracking-tight text-gray-900 dark:text-gray-100">{plan.content.title}</h2>
        {plan.content.summary ? <Muted>{plan.content.summary}</Muted> : null}
      </Card>
      <Body plan={plan.content} />
      <Muted>{plan.content.disclaimer}</Muted>
    </>
  );

  return (
    <Screen title={isWorkout ? 'Workout' : 'Diet'} subtitle={assigned ? 'From your trainer' : 'Made for you'}>
      <LoadState error={error} stale={stale} onRetry={reload} />

      {assigned && view(assigned, (
        <div className="flex items-center gap-2"><Pill tone="accent">{assigned.createdByName || 'Your trainer'}</Pill><Muted>{fmtDate(assigned.createdAt)}</Muted></div>
      ))}

      <Card className="space-y-3">
        <p className="font-bold text-gray-900 dark:text-gray-100">{assigned ? 'Or make your own' : `Your ${noun}`}</p>
        {isWorkout && (
          <Choice label="Days per week" value={String(days)} options={['1', '2', '3', '4', '5'].map((n) => ({ value: n, label: n }))} onChange={(v) => v && setDays(Number(v))} />
        )}
        <ErrorText>{genError}</ErrorText>
        <Btn busy={busy} kind={assigned ? 'secondary' : 'primary'} onClick={generate} className="w-full">{stored ? `Make a new ${noun}` : `Make my ${noun}`}</Btn>
        <Muted>Uses your profile and the equipment at your gym.</Muted>
        <Link to="/member/profile" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">Update my profile</Link>
      </Card>

      {stored
        ? view(stored, <div className="flex items-center gap-2"><Pill tone="info">{stored.source === 'ai' ? 'Written by AI' : 'Built-in plan'}</Pill><Muted>{fmtDate(stored.createdAt)}</Muted></div>)
        : !busy && !assigned && <Card><EmptyState title={`No ${noun} yet`} text="Tap the button above to make one." /></Card>}
    </Screen>
  );
}
