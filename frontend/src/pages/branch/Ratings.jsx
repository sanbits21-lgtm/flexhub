import { useEffect, useState } from 'react';
import { ratingsAPI } from '../../services/api';

const Stars = ({ value }) => (
  <span className="text-amber-500" role="img" aria-label={`${value} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map((n) => <span key={n} aria-hidden="true">{n <= Math.round(value) ? '★' : '☆'}</span>)}
  </span>
);

function Distribution({ counts }) {
  const max = Math.max(1, ...counts);
  return (
    <div className="space-y-1" aria-label="How many members gave each score">
      {[5, 4, 3, 2, 1].map((n) => (
        <div key={n} className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span className="w-3">{n}</span>
          <div className="h-2 flex-1 rounded bg-gray-100 dark:bg-gray-700"><div className="h-2 rounded bg-amber-400" style={{ width: `${(counts[n - 1] / max) * 100}%` }} /></div>
          <span className="w-6 text-right">{counts[n - 1]}</span>
        </div>
      ))}
    </div>
  );
}

function ScoreCard({ title, subtitle, row }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-gray-900 dark:text-gray-100">{title}</p>
          {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
        </div>
        {row.count > 0 ? (
          <div className="text-right"><p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{row.average}</p><Stars value={row.average} /></div>
        ) : <p className="text-sm text-gray-400">No ratings yet</p>}
      </div>
      {row.count > 0 && (
        <>
          <p className="mb-2 mt-1 text-xs text-gray-500 dark:text-gray-400">{row.count} rating{row.count === 1 ? '' : 's'}</p>
          <Distribution counts={row.distribution} />
          {row.recent.length > 0 && (
            <ul className="mt-3 space-y-2 border-t border-gray-100 pt-3 dark:border-gray-700">
              {row.recent.map((r, i) => (
                <li key={`${r.at}-${i}`} className="text-sm text-gray-700 dark:text-gray-200">
                  <Stars value={r.stars} /> <span className="text-xs text-gray-400">{new Date(r.at).toLocaleDateString()}</span>
                  <p>{r.comment}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

// Owners and branch managers: what members think of the gym and of each trainer.
export default function Ratings() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    ratingsAPI.overview().then((res) => setData(res.data)).catch((err) => setError(err.response?.data?.message || 'Could not load ratings.'));
  }, []);

  if (error) return <div className="p-6 text-sm text-red-600 dark:text-red-400" role="alert">{error}</div>;
  if (!data) return <div className="p-6 text-sm text-gray-500 dark:text-gray-400">Loading…</div>;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Ratings</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Comments are anonymous: you see what was said, not who said it. Members see only the gym's average, and only once {data.minPublic} have rated.
          Trainer scores are visible to owners and branch managers only.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Gym</h2>
        <div className="grid gap-3 md:grid-cols-2">{data.gym.map((g) => <ScoreCard key={g.branchId} title={g.branchName} row={g} />)}</div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Trainers</h2>
        {data.trainers.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No trainers yet.</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {data.trainers.map((t) => <ScoreCard key={t.trainerId} title={t.name} subtitle={[t.specialization, t.branchName].filter(Boolean).join(' - ')} row={t} />)}
        </div>
      </section>
    </div>
  );
}
