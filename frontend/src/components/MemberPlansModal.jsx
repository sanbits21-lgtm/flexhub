import { useEffect, useState } from 'react';
import Modal from './Modal';
import { memberPlansAPI } from '../services/api';

const input = 'border rounded px-2 py-1 w-full text-sm dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100';
const label = 'block text-xs text-gray-500 dark:text-gray-400 mb-1';
const btn = 'border rounded px-3 py-1.5 text-sm dark:border-gray-600 dark:text-gray-100';
const btnPrimary = 'bg-gray-900 text-white rounded px-4 py-1.5 text-sm dark:bg-accent dark:text-accent-ink dark:font-semibold disabled:opacity-50';

const lines = (text) => text.split('\n').map((s) => s.trim()).filter(Boolean);
const num = (v, fallback = 0) => (v === '' || v === null || Number.isNaN(Number(v)) ? fallback : Number(v));

const blankExercise = () => ({ name: '', sets: '3', reps: '10', restSec: '60', equipment: '', notes: '' });
const blank = {
  workout: () => ({ title: '', summary: '', days: [{ day: 'Day 1', focus: '', exercises: [blankExercise()] }], notes: '' }),
  diet: () => ({ title: '', summary: '', caloriesTarget: '2000', proteinG: '100', meals: [{ name: 'Breakfast', items: '', calories: '' }], tips: '' }),
};

// Saved plan -> form state (numbers become strings, lists become one-per-line text).
const toForm = (type, c) => (type === 'workout'
  ? {
    title: c.title, summary: c.summary || '', notes: (c.notes || []).join('\n'),
    days: c.days.map((d) => ({
      day: d.day, focus: d.focus,
      exercises: d.exercises.map((e) => ({ name: e.name, sets: String(e.sets), reps: e.reps, restSec: String(e.restSec ?? ''), equipment: e.equipment || '', notes: e.notes || '' })),
    })),
  }
  : {
    title: c.title, summary: c.summary || '', caloriesTarget: String(c.caloriesTarget), proteinG: String(c.proteinG), tips: (c.tips || []).join('\n'),
    meals: c.meals.map((m) => ({ name: m.name, items: m.items.join('\n'), calories: String(m.calories) })),
  });

// Form state -> what the API validates. Blank rows are dropped rather than rejected.
const toPayload = (type, f) => {
  if (type === 'diet') {
    return {
      title: f.title.trim(), summary: f.summary.trim(), tips: lines(f.tips),
      caloriesTarget: num(f.caloriesTarget), proteinG: num(f.proteinG),
      meals: f.meals.filter((m) => m.name.trim() && lines(m.items).length).map((m) => ({ name: m.name.trim(), items: lines(m.items), calories: num(m.calories) })),
    };
  }
  const days = f.days.map((d) => ({
    day: d.day.trim() || 'Day', focus: d.focus.trim() || 'Workout',
    exercises: d.exercises.filter((e) => e.name.trim()).map((e) => ({
      name: e.name.trim(), sets: num(e.sets, 1), reps: e.reps.trim() || '10', restSec: num(e.restSec, 0), equipment: e.equipment.trim() || 'Bodyweight', notes: e.notes.trim(),
    })),
  })).filter((d) => d.exercises.length);
  return { title: f.title.trim(), summary: f.summary.trim(), notes: lines(f.notes), days, daysPerWeek: days.length };
};

const when = (d) => new Date(d).toLocaleDateString();

function Field({ title, children }) {
  return <div><label className={label}>{title}</label>{children}</div>;
}

function WorkoutEditor({ value, onChange }) {
  const set = (patch) => onChange({ ...value, ...patch });
  const setDay = (i, patch) => set({ days: value.days.map((d, j) => (j === i ? { ...d, ...patch } : d)) });
  const setEx = (i, k, patch) => setDay(i, { exercises: value.days[i].exercises.map((e, j) => (j === k ? { ...e, ...patch } : e)) });
  return (
    <div className="space-y-3">
      <Field title="Plan title"><input className={input} value={value.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Rohan: strength block 1" /></Field>
      <Field title="Short note for the member (optional)"><input className={input} value={value.summary} onChange={(e) => set({ summary: e.target.value })} /></Field>

      {value.days.map((d, i) => (
        <div key={i} className="border rounded p-3 space-y-2 dark:border-gray-700">
          <div className="flex gap-2 items-end">
            <div className="w-28"><Field title="Day"><input className={input} value={d.day} onChange={(e) => setDay(i, { day: e.target.value })} /></Field></div>
            <div className="flex-1"><Field title="Focus"><input className={input} value={d.focus} onChange={(e) => setDay(i, { focus: e.target.value })} placeholder="Upper body" /></Field></div>
            {value.days.length > 1 && <button type="button" className="text-red-600 dark:text-red-400 text-sm pb-1" onClick={() => set({ days: value.days.filter((_, j) => j !== i) })}>Remove day</button>}
          </div>
          {d.exercises.map((e, k) => (
            <div key={k} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-12 sm:col-span-4"><Field title={k === 0 ? 'Exercise' : ''}><input className={input} value={e.name} onChange={(ev) => setEx(i, k, { name: ev.target.value })} placeholder="Incline press" /></Field></div>
              <div className="col-span-3 sm:col-span-1"><Field title={k === 0 ? 'Sets' : ''}><input className={input} inputMode="numeric" value={e.sets} onChange={(ev) => setEx(i, k, { sets: ev.target.value })} /></Field></div>
              <div className="col-span-3 sm:col-span-2"><Field title={k === 0 ? 'Reps' : ''}><input className={input} value={e.reps} onChange={(ev) => setEx(i, k, { reps: ev.target.value })} placeholder="8-10" /></Field></div>
              <div className="col-span-3 sm:col-span-1"><Field title={k === 0 ? 'Rest s' : ''}><input className={input} inputMode="numeric" value={e.restSec} onChange={(ev) => setEx(i, k, { restSec: ev.target.value })} /></Field></div>
              <div className="col-span-3 sm:col-span-2"><Field title={k === 0 ? 'Equipment' : ''}><input className={input} value={e.equipment} onChange={(ev) => setEx(i, k, { equipment: ev.target.value })} /></Field></div>
              <div className="col-span-10 sm:col-span-1"><Field title={k === 0 ? 'Notes' : ''}><input className={input} value={e.notes} onChange={(ev) => setEx(i, k, { notes: ev.target.value })} /></Field></div>
              <button type="button" aria-label="Remove exercise" className="col-span-2 sm:col-span-1 text-red-600 dark:text-red-400 text-sm pb-1" onClick={() => setDay(i, { exercises: d.exercises.filter((_, j) => j !== k) })}>Remove</button>
            </div>
          ))}
          <button type="button" className="text-blue-600 dark:text-blue-400 text-sm hover:underline" onClick={() => setDay(i, { exercises: [...d.exercises, blankExercise()] })}>+ Add exercise</button>
        </div>
      ))}
      {value.days.length < 7 && (
        <button type="button" className={btn} onClick={() => set({ days: [...value.days, { day: `Day ${value.days.length + 1}`, focus: '', exercises: [blankExercise()] }] })}>+ Add day</button>
      )}
      <Field title="Notes for the member (one per line, optional)"><textarea className={input} rows={3} value={value.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Skip jumping moves for 4 weeks." /></Field>
    </div>
  );
}

function DietEditor({ value, onChange }) {
  const set = (patch) => onChange({ ...value, ...patch });
  const setMeal = (i, patch) => set({ meals: value.meals.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
  return (
    <div className="space-y-3">
      <Field title="Plan title"><input className={input} value={value.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. High protein veg plan" /></Field>
      <Field title="Short note for the member (optional)"><input className={input} value={value.summary} onChange={(e) => set({ summary: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field title="Calories per day"><input className={input} inputMode="numeric" value={value.caloriesTarget} onChange={(e) => set({ caloriesTarget: e.target.value })} /></Field>
        <Field title="Protein per day (g)"><input className={input} inputMode="numeric" value={value.proteinG} onChange={(e) => set({ proteinG: e.target.value })} /></Field>
      </div>
      {value.meals.map((m, i) => (
        <div key={i} className="border rounded p-3 space-y-2 dark:border-gray-700">
          <div className="flex gap-2 items-end">
            <div className="flex-1"><Field title="Meal"><input className={input} value={m.name} onChange={(e) => setMeal(i, { name: e.target.value })} placeholder="Breakfast" /></Field></div>
            <div className="w-28"><Field title="Calories"><input className={input} inputMode="numeric" value={m.calories} onChange={(e) => setMeal(i, { calories: e.target.value })} /></Field></div>
            {value.meals.length > 1 && <button type="button" className="text-red-600 dark:text-red-400 text-sm pb-1" onClick={() => set({ meals: value.meals.filter((_, j) => j !== i) })}>Remove</button>}
          </div>
          <Field title="Foods (one per line)"><textarea className={input} rows={3} value={m.items} onChange={(e) => setMeal(i, { items: e.target.value })} placeholder={'2 eggs\n1 cup oats'} /></Field>
        </div>
      ))}
      {value.meals.length < 8 && <button type="button" className={btn} onClick={() => set({ meals: [...value.meals, { name: '', items: '', calories: '' }] })}>+ Add meal</button>}
      <Field title="Tips for the member (one per line, optional)"><textarea className={input} rows={3} value={value.tips} onChange={(e) => set({ tips: e.target.value })} /></Field>
    </div>
  );
}

// Staff-written plans for one member. A plan saved here appears in the member's app under
// "From your trainer", next to (not instead of) the plans they generate themselves.
export default function MemberPlansModal({ member, open, onClose }) {
  const [type, setType] = useState('workout');
  const [data, setData] = useState(null);
  const [editor, setEditor] = useState(null); // form state while writing, null while viewing
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => memberPlansAPI.list(member._id).then((r) => setData(r.data)).catch((e) => setError(e.response?.data?.message || 'Could not load plans.'));
  useEffect(() => {
    if (!open || !member) return;
    setType('workout'); setEditor(null); setError(''); setData(null);
    load();
  }, [open, member?._id]);

  if (!member) return null;
  const current = data?.current?.[type];
  const switchType = (t) => { setType(t); setEditor(null); setError(''); };

  const startDraft = async () => {
    setBusy(true); setError('');
    try {
      const res = await memberPlansAPI.draft(member._id, { type });
      setEditor(toForm(type, res.data.content));
    } catch (e) { setError(e.response?.data?.message || 'Could not make a suggestion.'); } finally { setBusy(false); }
  };

  const save = async () => {
    setBusy(true); setError('');
    try {
      await memberPlansAPI.create(member._id, { type, content: toPayload(type, editor) });
      setEditor(null);
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Could not save the plan.'); } finally { setBusy(false); }
  };

  const withdraw = async () => {
    if (!window.confirm('Remove this plan from the member\'s app?')) return;
    setBusy(true); setError('');
    try { await memberPlansAPI.withdraw(member._id, current._id); await load(); } catch (e) { setError(e.response?.data?.message || 'Could not remove the plan.'); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} wide title={`Workout & diet plans: ${member.name}`}>
      <div className="flex gap-2 mb-4">
        {['workout', 'diet'].map((t) => (
          <button key={t} type="button" onClick={() => switchType(t)} className={`px-3 py-1.5 rounded text-sm ${type === t ? 'bg-gray-900 text-white dark:bg-accent dark:text-accent-ink dark:font-semibold' : 'border dark:border-gray-600 dark:text-gray-100'}`}>
            {t === 'workout' ? 'Workout' : 'Diet'}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>}

      {editor ? (
        <>
          {type === 'workout' ? <WorkoutEditor value={editor} onChange={setEditor} /> : <DietEditor value={editor} onChange={setEditor} />}
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">The member sees this in their app straight away, with a standard &ldquo;not medical advice&rdquo; note added.</p>
          <div className="flex gap-2 mt-3">
            <button type="button" className={btnPrimary} onClick={save} disabled={busy || !editor.title.trim()}>{busy ? 'Saving...' : 'Save and send to member'}</button>
            <button type="button" className={btn} onClick={() => setEditor(null)} disabled={busy}>Cancel</button>
          </div>
        </>
      ) : (
        <div className="space-y-3 text-sm text-gray-700 dark:text-gray-200">
          {!data && !error && <p className="text-gray-500">Loading...</p>}
          {data && (current ? (
            <div className="border rounded p-3 dark:border-gray-700">
              <div className="font-medium">{current.content.title}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">By {current.createdByName || 'staff'} on {when(current.createdAt)}</div>
              <div className="mt-1">
                {type === 'workout'
                  ? `${current.content.days.length} day${current.content.days.length === 1 ? '' : 's'}: ${current.content.days.map((d) => d.focus).join(', ')}`
                  : `${current.content.caloriesTarget} kcal, ${current.content.proteinG} g protein, ${current.content.meals.length} meals`}
              </div>
            </div>
          ) : <p className="text-gray-500 dark:text-gray-400">No {type} plan from staff yet. The member can still make their own in the app.</p>)}
          {data && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btnPrimary} onClick={() => setEditor(blank[type]())} disabled={busy}>Write a new plan</button>
              <button type="button" className={btn} onClick={startDraft} disabled={busy}>{busy ? 'Working...' : 'Start from a suggestion'}</button>
              {current && <button type="button" className={btn} onClick={() => setEditor(toForm(type, current.content))} disabled={busy}>Edit current</button>}
              {current && <button type="button" className={`${btn} text-red-600 dark:text-red-400`} onClick={withdraw} disabled={busy}>Remove from app</button>}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
