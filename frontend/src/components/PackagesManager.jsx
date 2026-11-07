import { useEffect, useState } from 'react';
import { packagesAPI } from '../services/api';
import { CYCLES, limitsLabel, priceLabel, trialLabel } from '../utils/packages';

const inputClass = 'border rounded-xl px-3 py-2.5 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 w-full';
const labelClass = 'block text-sm text-gray-600 dark:text-gray-300 mb-1';
const EMPTY = { name: '', description: '', price: 0, billingCycle: 'monthly', trialDays: 14, maxBranches: 1, maxMembers: 100, unlimited: false, highlights: '', isFeatured: false, isActive: true, sortOrder: 0 };

const toForm = (p) => ({ ...EMPTY, ...p, unlimited: !p.maxMembers, maxMembers: p.maxMembers || 100, highlights: (p.highlights || []).join('\n') });
const toPayload = (f) => ({
  name: f.name,
  description: f.description,
  price: Number(f.price),
  billingCycle: f.billingCycle,
  trialDays: Number(f.trialDays),
  maxBranches: Number(f.maxBranches),
  maxMembers: f.unlimited ? null : Number(f.maxMembers),
  highlights: f.highlights.split('\n').map((s) => s.trim()).filter(Boolean),
  isFeatured: f.isFeatured,
  isActive: f.isActive,
  sortOrder: Number(f.sortOrder),
});

/** The plans a new gym can pick on the registration page. Super-admin only. */
export default function PackagesManager() {
  const [packages, setPackages] = useState(null);
  const [form, setForm] = useState(null); // null = closed; { _id? ...fields }
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => packagesAPI.list().then((r) => setPackages(r.data)).catch(() => setError('Could not load packages.'));
  useEffect(() => { load(); }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const fail = (e) => setError(e.response?.data?.message || 'That did not work.');

  const save = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (form._id) await packagesAPI.update(form._id, toPayload(form));
      else await packagesAPI.create(toPayload(form));
      setForm(null);
      await load();
    } catch (err) { fail(err); } finally { setBusy(false); }
  };
  const toggle = async (p) => { setError(''); try { await packagesAPI.update(p._id, { isActive: !p.isActive }); await load(); } catch (err) { fail(err); } };
  const remove = async (p) => {
    if (!window.confirm(`Delete the "${p.name}" package?`)) return;
    setError('');
    try { await packagesAPI.remove(p._id); await load(); } catch (err) { fail(err); }
  };

  const card = 'bg-white dark:bg-gray-800 dark:border dark:border-gray-700 rounded-2xl shadow p-4';
  const btn = 'text-blue-600 dark:text-blue-400 hover:underline text-sm';
  return (
    <section aria-label="Subscription packages" className={`${card} space-y-4`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Subscription packages</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">Shown on the registration page. A gym gets its package's limits when you approve it; edits here only affect future approvals.</p>
        </div>
        {!form && <button type="button" onClick={() => setForm({ ...EMPTY })} className="bg-gray-900 text-white rounded-xl px-4 py-2 shrink-0 dark:bg-accent dark:text-accent-ink dark:font-semibold">Add package</button>}
      </div>
      {error && <div role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</div>}

      {form && (
        <form onSubmit={save} className="space-y-3 border rounded-xl p-4 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">{form._id ? 'Edit package' : 'New package'}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label htmlFor="pk-name" className={labelClass}>Name</label><input id="pk-name" required minLength={2} maxLength={40} value={form.name} onChange={set('name')} className={inputClass} /></div>
            <div><label htmlFor="pk-order" className={labelClass}>Order on the page</label><input id="pk-order" type="number" min="0" max="1000" value={form.sortOrder} onChange={set('sortOrder')} className={inputClass} /></div>
          </div>
          <div><label htmlFor="pk-desc" className={labelClass}>Short description</label><input id="pk-desc" maxLength={200} value={form.description} onChange={set('description')} className={inputClass} /></div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><label htmlFor="pk-price" className={labelClass}>Price (₹, 0 = free)</label><input id="pk-price" type="number" min="0" value={form.price} onChange={set('price')} className={inputClass} /></div>
            <div><label htmlFor="pk-cycle" className={labelClass}>Billed</label><select id="pk-cycle" value={form.billingCycle} onChange={set('billingCycle')} className={inputClass}>{CYCLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div><label htmlFor="pk-trial" className={labelClass}>Free trial days (0 = none)</label><input id="pk-trial" type="number" min="0" max="365" value={form.trialDays} onChange={set('trialDays')} className={inputClass} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label htmlFor="pk-br" className={labelClass}>Branches allowed</label><input id="pk-br" type="number" min="1" max="100" value={form.maxBranches} onChange={set('maxBranches')} className={inputClass} /></div>
            <div>
              <label htmlFor="pk-mem" className={labelClass}>Members allowed</label>
              <input id="pk-mem" type="number" min="1" max="100000" disabled={form.unlimited} value={form.unlimited ? '' : form.maxMembers} placeholder={form.unlimited ? 'Unlimited' : ''} onChange={set('maxMembers')} className={`${inputClass} disabled:opacity-50`} />
              <label className="flex items-center gap-2 mt-1 text-sm text-gray-700 dark:text-gray-200"><input type="checkbox" checked={form.unlimited} onChange={set('unlimited')} /> Unlimited</label>
            </div>
          </div>
          <div><label htmlFor="pk-hl" className={labelClass}>Highlights (one per line, up to 10)</label><textarea id="pk-hl" rows={4} value={form.highlights} onChange={set('highlights')} className={inputClass} placeholder={'QR check-in\nMember mobile app'} /></div>
          <div className="flex flex-wrap gap-6 text-sm text-gray-800 dark:text-gray-100">
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.isActive} onChange={set('isActive')} /> Offered on the registration page</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.isFeatured} onChange={set('isFeatured')} /> Mark as "Most popular"</label>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="bg-gray-900 text-white rounded-xl px-4 py-2 dark:bg-accent dark:text-accent-ink dark:font-semibold disabled:opacity-50">{busy ? 'Saving...' : 'Save package'}</button>
            <button type="button" onClick={() => { setForm(null); setError(''); }} className="border rounded-xl px-4 py-2 dark:border-gray-600 dark:text-gray-100">Cancel</button>
          </div>
        </form>
      )}

      {packages === null && !error && <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>}
      {packages && packages.length === 0 && <p className="text-sm text-gray-600 dark:text-gray-300">No packages yet. Until you add one, new gyms register for the plain free trial above.</p>}
      {packages && packages.length > 0 && (
        <ul className="divide-y dark:divide-gray-700">
          {packages.map((p) => (
            <li key={p._id} className="py-3 flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-gray-900 dark:text-gray-100">
                  {p.name} <span className="font-normal text-gray-600 dark:text-gray-300">· {priceLabel(p)}</span>
                  {p.isFeatured && <span className="ml-2 text-xs rounded-full px-2 py-0.5 bg-accent/15 dark:text-accent">Most popular</span>}
                  {!p.isActive && <span className="ml-2 text-xs rounded-full px-2 py-0.5 bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200">Hidden</span>}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-300">{limitsLabel(p)} · {trialLabel(p)}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{p.gyms} gym{p.gyms === 1 ? '' : 's'}</div>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => { setError(''); setForm(toForm(p)); }} className={btn}>Edit</button>
                <button type="button" onClick={() => toggle(p)} className={btn}>{p.isActive ? 'Hide' : 'Show'}</button>
                <button type="button" onClick={() => remove(p)} className="text-red-600 dark:text-red-400 hover:underline text-sm">Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
