import { useEffect, useState } from 'react';
import { platformSettingsAPI } from '../../services/api';

const inputClass = 'border rounded-xl px-3 py-2.5 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 w-full';
const labelClass = 'block text-sm text-gray-600 dark:text-gray-300 mb-1';

export default function PlatformSettings() {
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { platformSettingsAPI.get().then((r) => setForm(r.data)); }, []);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const { data } = await platformSettingsAPI.update({
        selfSignupEnabled: form.selfSignupEnabled,
        trialDays: Number(form.trialDays),
        trialMaxMembers: Number(form.trialMaxMembers),
        trialMaxBranches: Number(form.trialMaxBranches),
      });
      setForm(data);
      setMessage({ ok: true, text: 'Saved. New approvals use these terms.' });
    } catch (err) {
      setMessage({ ok: false, text: err.response?.data?.message || 'Could not save.' });
    } finally {
      setBusy(false);
    }
  };

  if (!form) return <div className="p-6 text-gray-500 dark:text-gray-400">Loading...</div>;
  const num = (key, label, hint, max) => (
    <div>
      <label htmlFor={key} className={labelClass}>{label}</label>
      <input id={key} type="number" min="1" max={max} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className={inputClass} />
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{hint}</p>
    </div>
  );

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Platform Settings</h1>
      <form onSubmit={save} className="bg-white dark:bg-gray-800 dark:border dark:border-gray-700 p-4 rounded-2xl shadow space-y-4">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Self-registration and free trial</h2>
        <label className="flex items-center gap-3 text-gray-800 dark:text-gray-100">
          <input type="checkbox" checked={!!form.selfSignupEnabled} onChange={(e) => setForm({ ...form, selfSignupEnabled: e.target.checked })} className="h-5 w-5" />
          Let new gyms register themselves (you approve each one)
        </label>
        {num('trialDays', 'Trial length (days)', 'Counted from the day you approve a gym, not from when it registers. You can override this for one gym when approving it.', 365)}
        {num('trialMaxMembers', 'Members allowed during the trial', 'Adding more is blocked until the gym moves to a paid plan.', 100000)}
        {num('trialMaxBranches', 'Branches allowed during the trial', 'Applies to new approvals; existing gyms keep what they were given.', 100)}
        {message && <div role="status" className={`text-sm ${message.ok ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>{message.text}</div>}
        <button type="submit" disabled={busy} className="bg-gray-900 text-white rounded px-4 py-2 dark:bg-accent dark:text-accent-ink dark:font-semibold dark:hover:bg-accent-hover disabled:opacity-50">{busy ? 'Saving...' : 'Save'}</button>
      </form>
    </div>
  );
}
