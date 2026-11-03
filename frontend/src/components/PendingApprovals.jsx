import { useEffect, useState } from 'react';
import { platformSettingsAPI, tenantsAPI } from '../services/api';

const inputClass = 'border rounded-lg px-2 py-1.5 w-24 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100';

/** Self-registered gyms waiting for a decision. Approving starts their trial with the platform's terms (or yours for this gym). */
export default function PendingApprovals({ tenants, onChanged }) {
  const [defaults, setDefaults] = useState(null);
  const [terms, setTerms] = useState({}); // per-tenant overrides
  const [error, setError] = useState('');
  const pending = tenants.filter((t) => t.approvalStatus === 'pending');
  const rejected = tenants.filter((t) => t.approvalStatus === 'rejected');

  useEffect(() => { platformSettingsAPI.get().then((r) => setDefaults(r.data)).catch(() => {}); }, []);
  if (pending.length === 0 && rejected.length === 0) return null;

  const val = (id, key, fallback) => terms[id]?.[key] ?? fallback;
  const setTerm = (id, key, v) => setTerms({ ...terms, [id]: { ...terms[id], [key]: v } });

  const act = async (fn) => {
    setError('');
    try { await fn(); onChanged(); } catch (e) { setError(e.response?.data?.message || 'That did not work.'); }
  };
  const approve = (t) => act(() => tenantsAPI.approve(t._id, {
    trialDays: Number(val(t._id, 'trialDays', defaults?.trialDays)),
    maxMembers: Number(val(t._id, 'maxMembers', defaults?.trialMaxMembers)),
    maxBranches: Number(val(t._id, 'maxBranches', defaults?.trialMaxBranches)),
  }));
  const reject = (t) => {
    const reason = window.prompt(`Reject "${t.name}"? Optionally tell them why (they will see this):`, '');
    if (reason === null) return;
    return act(() => tenantsAPI.reject(t._id, reason));
  };

  const card = 'bg-white dark:bg-gray-800 dark:border dark:border-gray-700 rounded-2xl shadow p-4';
  return (
    <section aria-label="Pending approval" className="space-y-3">
      {pending.length > 0 && <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Pending approval ({pending.length})</h2>}
      {error && <div role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</div>}
      {pending.map((t) => (
        <div key={t._id} className={`${card} space-y-3`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <div className="font-bold text-gray-900 dark:text-gray-100">{t.name} <span className="font-normal text-gray-500 dark:text-gray-400">({t.slug})</span></div>
              <div className="text-sm text-gray-600 dark:text-gray-300">{t.owner?.name} · {t.owner?.email} · {t.contactPhone || 'no phone'}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Registered {new Date(t.createdAt).toLocaleString()}</div>
            </div>
            <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${t.owner?.emailVerified ? 'bg-green-500/15 text-green-700 dark:text-green-300' : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'}`}>
              {t.owner?.emailVerified ? 'Email confirmed' : 'Email not confirmed yet'}
            </span>
          </div>
          <div className="flex flex-wrap items-end gap-3 text-sm text-gray-700 dark:text-gray-200">
            <label>Trial days<input type="number" min="1" max="365" value={val(t._id, 'trialDays', defaults?.trialDays ?? '')} onChange={(e) => setTerm(t._id, 'trialDays', e.target.value)} className={`${inputClass} block`} /></label>
            <label>Members<input type="number" min="1" value={val(t._id, 'maxMembers', defaults?.trialMaxMembers ?? '')} onChange={(e) => setTerm(t._id, 'maxMembers', e.target.value)} className={`${inputClass} block`} /></label>
            <label>Branches<input type="number" min="1" value={val(t._id, 'maxBranches', defaults?.trialMaxBranches ?? '')} onChange={(e) => setTerm(t._id, 'maxBranches', e.target.value)} className={`${inputClass} block`} /></label>
            <button type="button" disabled={!t.owner?.emailVerified} onClick={() => approve(t)} title={t.owner?.emailVerified ? '' : 'Waiting for the owner to confirm their email'} className="bg-gray-900 text-white rounded px-4 py-2 dark:bg-accent dark:text-accent-ink dark:font-semibold dark:hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed">Approve</button>
            <button type="button" onClick={() => reject(t)} className="border rounded px-4 py-2 text-red-700 dark:text-red-400 dark:border-gray-600">Reject</button>
          </div>
        </div>
      ))}
      {rejected.length > 0 && (
        <details className={card}>
          <summary className="cursor-pointer text-sm text-gray-700 dark:text-gray-200">Rejected registrations ({rejected.length})</summary>
          <ul className="mt-2 space-y-1 text-sm text-gray-700 dark:text-gray-200">
            {rejected.map((t) => (
              <li key={t._id} className="flex items-center justify-between gap-2">
                <span>{t.name}{t.rejectionReason ? `, ${t.rejectionReason}` : ''}</span>
                <button type="button" onClick={() => approve(t)} className="underline text-blue-700 dark:text-blue-400">Approve after all</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
