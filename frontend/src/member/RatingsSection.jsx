import { useState } from 'react';
import { memberApi, errorText } from './api';
import { Btn, Card, ErrorText, Field, Initials, Muted, Section } from './ui';

// Rating the gym and its trainers. Members see the gym's average only once enough people have
// rated; a trainer's score is private to the owner and branch manager, and so are all comments.

export function Stars({ value, size = 'text-xl' }) {
  return (
    <span className={`${size} tracking-tight text-amber-500`} role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => <span key={n} aria-hidden="true">{n <= Math.round(value) ? '★' : '☆'}</span>)}
    </span>
  );
}

function StarPicker({ label, value, onChange }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          onClick={() => onChange(n)}
          className={`h-11 w-11 rounded-xl border text-2xl ${n <= value ? 'border-amber-400 bg-amber-50 text-amber-500 dark:bg-amber-500/10' : 'border-gray-300 text-gray-300 dark:border-gray-600 dark:text-gray-600'}`}
        >
          {'★'}
        </button>
      ))}
    </div>
  );
}

function RateForm({ label, initial, path, onDone, onCancel }) {
  const [stars, setStars] = useState(initial?.stars || 0);
  const [comment, setComment] = useState(initial?.comment || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await memberApi.put(path, { stars, ...(comment.trim() ? { comment: comment.trim() } : {}) });
      onDone();
    } catch (err) {
      setError(errorText(err, 'Could not save your rating.'));
    } finally {
      setBusy(false);
    }
  };
  const withdraw = async () => {
    setBusy(true);
    setError('');
    try { await memberApi.delete(path); onDone(); } catch (err) { setError(errorText(err, 'Could not remove your rating.')); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3 pt-3">
      <StarPicker label={label} value={stars} onChange={setStars} />
      <Field label="Comment (optional)" multiline maxLength={500} placeholder="What went well? What could be better?" value={comment} onChange={(e) => setComment(e.target.value)} hint="Only the owner and your branch manager can read this. It does not show your name." />
      <ErrorText>{error}</ErrorText>
      <div className="flex flex-wrap gap-2">
        <Btn small busy={busy} disabled={stars === 0} onClick={save}>Save rating</Btn>
        <Btn small kind="secondary" disabled={busy} onClick={onCancel}>Cancel</Btn>
        {initial && <Btn small kind="danger" disabled={busy} onClick={withdraw}>Remove my rating</Btn>}
      </div>
    </div>
  );
}

export default function RatingsSection({ data, reload }) {
  const [open, setOpen] = useState(null); // 'gym' or a trainer id
  if (!data) return null;
  const { gym, trainers, minPublic } = data;
  const done = () => { setOpen(null); reload(); };

  return (
    <>
      <Section title="Rate your gym" />
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            {gym.average !== null
              ? <div className="flex items-center gap-2"><Stars value={gym.average} /><span className="font-bold text-gray-900 dark:text-gray-100">{gym.average}</span><Muted>({gym.count} members)</Muted></div>
              : <Muted>The gym's score shows once {minPublic} members have rated.</Muted>}
          </div>
          {gym.canRate && open !== 'gym' && <Btn small kind="secondary" onClick={() => setOpen('gym')}>{gym.mine ? 'Change' : 'Rate'}</Btn>}
        </div>
        {gym.mine && open !== 'gym' && <div className="mt-2 flex items-center gap-2"><Muted>Your rating</Muted><Stars value={gym.mine.stars} size="text-base" /></div>}
        {!gym.canRate && <Muted className="mt-2">You can rate the gym after your first visit.</Muted>}
        {open === 'gym' && <RateForm label="Rate the gym" initial={gym.mine} path="/member-app/ratings/gym" onDone={done} onCancel={() => setOpen(null)} />}
      </Card>

      <Section title="Rate your trainers" />
      <Card className="py-1">
        {trainers.length === 0 && <Muted className="py-3">No trainers listed yet.</Muted>}
        {trainers.map((t, i) => (
          <div key={t._id} className={`py-3 ${i === trainers.length - 1 ? '' : 'border-b border-gray-100 dark:border-gray-700'}`}>
            <div className="flex items-center gap-3">
              <Initials name={t.name} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-gray-900 dark:text-gray-100">{t.name}</p>
                {t.mine ? <Stars value={t.mine.stars} size="text-base" /> : <Muted>{t.canRate ? 'Not rated yet' : 'Rate a trainer who trains you'}</Muted>}
              </div>
              {t.canRate && open !== t._id && <Btn small kind="secondary" onClick={() => setOpen(t._id)}>{t.mine ? 'Change' : 'Rate'}</Btn>}
            </div>
            {open === t._id && <RateForm label={`Rate ${t.name}`} initial={t.mine} path={`/member-app/ratings/trainers/${t._id}`} onDone={done} onCancel={() => setOpen(null)} />}
          </div>
        ))}
        <Muted className="pb-3">Trainer ratings are private: only the owner and your branch manager see them.</Muted>
      </Card>
    </>
  );
}
