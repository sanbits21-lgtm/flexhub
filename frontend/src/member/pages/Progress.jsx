import { useState } from 'react';
import { memberApi, errorText } from '../api';
import { useLoad } from '../useLoad';
import { Banner, Btn, Card, EmptyState, ErrorText, Field, LoadState, Loading, Muted, Pill, Screen, Section, Stat } from '../ui';
import { fmtDate } from '../format';

const today = () => new Date().toISOString().slice(0, 10);
const signed = (n, unit) => (n === null || n === undefined ? '-' : `${n > 0 ? '+' : ''}${n} ${unit}`);

// A plain line chart of weight over time. No chart library: it is a handful of points, and the
// page should open fast on a phone in a gym with poor signal.
function WeightChart({ metrics }) {
  const points = metrics.filter((m) => Number.isFinite(m.weightKg));
  if (points.length < 2) return <Muted>Add a second measurement to see your line.</Muted>;
  const W = 300; const H = 120; const pad = 16;
  const times = points.map((p) => new Date(p.date).getTime());
  const kgs = points.map((p) => p.weightKg);
  const [t0, t1] = [Math.min(...times), Math.max(...times)];
  const [lo, hi] = [Math.min(...kgs), Math.max(...kgs)];
  const x = (t) => pad + (t1 === t0 ? 0.5 : (t - t0) / (t1 - t0)) * (W - 2 * pad);
  const y = (kg) => H - pad - (hi === lo ? 0.5 : (kg - lo) / (hi - lo)) * (H - 2 * pad);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(times[i]).toFixed(1)},${y(p.weightKg).toFixed(1)}`).join(' ');
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Weight from ${points[0].weightKg} kg to ${points[points.length - 1].weightKg} kg over ${points.length} measurements`}>
        <path d={path} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" className="text-gray-900 dark:text-accent" />
        {points.map((p, i) => <circle key={p._id || i} cx={x(times[i])} cy={y(p.weightKg)} r="3" className="fill-current text-gray-900 dark:text-accent" />)}
        <text x={pad} y="11" fontSize="10" className="fill-current text-gray-500">{hi} kg</text>
        <text x={pad} y={H - 3} fontSize="10" className="fill-current text-gray-500">{lo} kg</text>
      </svg>
      <figcaption className="flex justify-between text-xs text-gray-500 dark:text-gray-400"><span>{fmtDate(points[0].date)}</span><span>{fmtDate(points[points.length - 1].date)}</span></figcaption>
    </figure>
  );
}

function Badge({ a }) {
  const pct = Math.round((a.progress.value / a.progress.target) * 100);
  return (
    <li className={`rounded-xl border p-3 ${a.earned ? 'border-accent bg-accent/10' : 'border-gray-200 dark:border-gray-700'}`}>
      <div className="flex items-center justify-between gap-2">
        <p className={`text-sm font-bold ${a.earned ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}>{a.title}</p>
        {a.earned ? <Pill tone="accent">Earned</Pill> : null}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">{a.text}</p>
      {!a.earned && (
        <div className="mt-2" aria-label={`${a.progress.value} of ${a.progress.target}`}>
          <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700"><div className="h-1.5 rounded-full bg-accent" style={{ width: `${Math.max(pct, 2)}%` }} /></div>
          <p className="mt-1 text-xs text-gray-400">{a.progress.value} / {a.progress.target}</p>
        </div>
      )}
    </li>
  );
}

export default function Progress() {
  const { data, loading, error, stale, reload, setData } = useLoad('progress', () => memberApi.get('/member-app/progress').then((r) => r.data));
  const [form, setForm] = useState({ weightKg: '', bodyFatPct: '', notes: '', date: today() });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  if (loading) return <Loading />;
  if (!data) return <Screen title="Progress"><LoadState error={error} onRetry={reload} /></Screen>;

  const { summary, stats, metrics, achievements } = data;
  const earned = achievements.filter((a) => a.earned);
  const groups = [...new Set(achievements.map((a) => a.group))];

  const add = async () => {
    setBusy(true);
    setFormError('');
    try {
      const body = { date: form.date };
      if (form.weightKg !== '') body.weightKg = form.weightKg;
      if (form.bodyFatPct !== '') body.bodyFatPct = form.bodyFatPct;
      if (form.notes.trim()) body.notes = form.notes.trim();
      const res = await memberApi.post('/member-app/progress', body);
      setData(res.data);
      setForm({ weightKg: '', bodyFatPct: '', notes: '', date: today() });
    } catch (err) {
      setFormError(errorText(err, 'Could not save that measurement.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this measurement?')) return;
    try { setData((await memberApi.delete(`/member-app/progress/${id}`)).data); } catch (err) { setFormError(errorText(err, 'Could not delete it.')); }
  };

  return (
    <Screen title="Progress" subtitle={`${earned.length} of ${achievements.length} badges`}>
      <LoadState error={error} stale={stale} onRetry={reload} />
      <Banner tone="info">Only you can see this. Your trainer sees the measurements they take with you.</Banner>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Weight now" value={summary.latestWeightKg !== null ? `${summary.latestWeightKg} kg` : '-'} hint={summary.bmi ? `BMI ${summary.bmi}` : undefined} />
        <Stat label="Since you started" value={signed(summary.changeKg, 'kg')} hint={summary.changeBodyFatPct !== null ? `Body fat ${signed(summary.changeBodyFatPct, 'pts')}` : undefined} />
        <Stat label="Visits this month" value={stats.visitsThisMonth} hint={`${stats.totalVisits} in total`} />
        <Stat label="Weeks in a row" value={stats.currentStreakWeeks} hint={`Best ${stats.bestStreakWeeks}`} />
      </div>

      <Section title="Your weight" />
      <Card><WeightChart metrics={metrics} /></Card>

      <Section title="Add a measurement" />
      <Card className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Weight (kg)" type="number" inputMode="decimal" min="20" max="400" step="0.1" value={form.weightKg} onChange={(e) => setForm({ ...form, weightKg: e.target.value })} />
          <Field label="Body fat % (optional)" type="number" inputMode="decimal" min="3" max="60" step="0.1" value={form.bodyFatPct} onChange={(e) => setForm({ ...form, bodyFatPct: e.target.value })} />
        </div>
        <Field label="Date" type="date" max={today()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        <Field label="Note (optional)" maxLength={200} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        <ErrorText>{formError}</ErrorText>
        <Btn busy={busy} onClick={add} disabled={form.weightKg === '' && form.bodyFatPct === ''}>Save measurement</Btn>
      </Card>

      <Section title="Badges" />
      {groups.map((g) => (
        <Card key={g} className="space-y-2">
          <p className="text-xs font-extrabold uppercase tracking-wider text-gray-500 dark:text-gray-400">{g}</p>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">{achievements.filter((a) => a.group === g).map((a) => <Badge key={a.key} a={a} />)}</ul>
        </Card>
      ))}
      {!data.goal && <Muted>Set your goal in Profile to unlock weight badges.</Muted>}

      <Section title="History" />
      <Card className="py-1">
        {metrics.length === 0 ? <EmptyState title="Nothing yet" text="Your first measurement starts the chart." /> : [...metrics].reverse().map((m, i, all) => (
          <div key={m._id} className={`flex items-center gap-3 py-3 ${i === all.length - 1 ? '' : 'border-b border-gray-100 dark:border-gray-700'}`}>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{[m.weightKg ? `${m.weightKg} kg` : null, m.bodyFatPct ? `${m.bodyFatPct}% fat` : null].filter(Boolean).join('  |  ')}</p>
              <Muted>{fmtDate(m.date)}{m.notes ? ` - ${m.notes}` : ''}{m.source === 'staff' ? ' - taken by your trainer' : ''}</Muted>
            </div>
            {m.source === 'member' && <button type="button" onClick={() => remove(m._id)} className="text-sm text-red-600 dark:text-red-400">Delete</button>}
          </div>
        ))}
      </Card>
    </Screen>
  );
}
