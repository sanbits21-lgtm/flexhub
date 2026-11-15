import { useEffect, useState } from 'react';
import Modal from './Modal';
import { fieldClass, primaryBtn, toolBtn } from './ListToolbar';
import { tenantsAPI } from '../services/api';

const DAY = 86400000;
const QUICK = [7, 14, 30];
const fmt = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const errorMessage = (err) => err?.response?.data?.message || err?.message || 'Something went wrong. Please try again.';
const inputDate = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// A date picked in the box means "through the end of that day".
const endOfDay = (value) => new Date(`${value}T23:59:00`);

/** Gives a gym on a free trial more time: add some days, or set the day it ends. */
export default function ExtendTrialDialog({ tenant, onClose, onDone }) {
  const [mode, setMode] = useState('days'); // days | date
  const [days, setDays] = useState(14);
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (tenant) { setMode('days'); setDays(14); setDate(''); setError(''); } }, [tenant]);
  if (!tenant) return null;

  const now = Date.now();
  const end = tenant.trialEndsAt ? new Date(tenant.trialEndsAt).getTime() : null;
  const ended = end !== null && end <= now;
  const currentLeft = end === null ? null : Math.ceil((end - now) / DAY);

  const n = Number(days);
  const daysOk = Number.isInteger(n) && n >= 1 && n <= 365;
  const dateOk = !!date && endOfDay(date).getTime() > now;
  const next = mode === 'days' ? (daysOk ? Math.max(now, end || 0) + n * DAY : null) : (dateOk ? endOfDay(date).getTime() : null);
  const nextLeft = next === null ? null : Math.ceil((next - now) / DAY);

  const submit = async (e) => {
    e.preventDefault();
    if (next === null || busy) return;
    setBusy(true);
    setError('');
    try {
      await tenantsAPI.extendTrial(tenant._id, mode === 'days' ? { days: n } : { endsAt: endOfDay(date).toISOString() });
      onDone();
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={`Extend trial: ${tenant.name}`}>
      <form onSubmit={submit} className="space-y-4 text-sm text-gray-700 dark:text-gray-200">
        <p>
          {end === null ? 'This trial has no end date yet.' : ended ? <>The trial <strong>ended {fmt(end)}</strong> ({Math.abs(currentLeft)} day{Math.abs(currentLeft) === 1 ? '' : 's'} ago), so the gym is read-only. Extending counts from today and unlocks it.</> : <>The trial ends <strong>{fmt(end)}</strong> ({currentLeft} day{currentLeft === 1 ? '' : 's'} left).</>}
        </p>

        <div role="radiogroup" aria-label="How to extend" className="flex gap-2">
          {[['days', 'Add days'], ['date', 'Set end date']].map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={mode === v} onClick={() => setMode(v)} className={`rounded-full border px-3 py-1 ${mode === v ? 'border-accent bg-accent/15 font-semibold text-gray-900 dark:text-white' : 'border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300'}`}>{l}</button>
          ))}
        </div>

        {mode === 'days' ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {QUICK.map((q) => <button key={q} type="button" onClick={() => setDays(q)} className={`${toolBtn} ${n === q ? '!border-accent' : ''}`}>+{q} days</button>)}
            </div>
            <label htmlFor="xt-days" className="block text-xs text-gray-500 dark:text-gray-400">Or a number of days (1 to 365)</label>
            <input id="xt-days" type="number" min="1" max="365" step="1" value={days} onChange={(e) => setDays(e.target.value)} className={`${fieldClass} !w-32`} />
          </div>
        ) : (
          <div>
            <label htmlFor="xt-date" className="mb-1 block text-xs text-gray-500 dark:text-gray-400">The trial ends at the end of this day</label>
            <input id="xt-date" type="date" min={inputDate(now + DAY)} max={inputDate(now + 2 * 365 * DAY)} value={date} onChange={(e) => setDate(e.target.value)} className={`${fieldClass} !w-48`} />
          </div>
        )}

        <p className="rounded-xl bg-accent/10 px-3 py-2" role="status">
          {next === null ? (mode === 'days' ? 'Enter a whole number of days from 1 to 365.' : 'Pick a day in the future.') : <>New trial end: <strong>{fmt(next)}</strong> ({nextLeft} day{nextLeft === 1 ? '' : 's'} from today).</>}
        </p>
        {error && <p role="alert" className="text-red-600 dark:text-red-400">{error}</p>}
        <p className="text-xs text-gray-500 dark:text-gray-400">The owner is emailed the new date, and the reminder emails start again for it.</p>
        <div className="flex gap-2">
          <button type="submit" disabled={next === null || busy} className={primaryBtn}>{busy ? 'Extending...' : 'Extend trial'}</button>
          <button type="button" onClick={onClose} className={toolBtn}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}
