import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { tenantSettingsAPI } from '../../services/api';
import { buildUpiLink } from '../../utils/upi';

const inputClass = 'border rounded px-2 py-1 dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100';
const primaryBtn = 'bg-gray-900 text-white rounded px-4 py-2 dark:bg-accent dark:text-accent-ink dark:font-semibold dark:hover:bg-accent-hover disabled:opacity-50';
const ghostBtn = 'border rounded px-4 py-2 text-sm dark:border-gray-600 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50';
const UPI_ID = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
const errorOf = (err) => err.response?.data?.message || 'Could not save. Please try again.';

// One UPI account: an ID, an optional payment link, and a live QR so the owner can test it.
function AccountForm({ title, note, payeeName, initial, onSave, onClear, clearLabel }) {
  const [form, setForm] = useState({ upiId: initial.upiId || '', upiPaymentLink: initial.upiPaymentLink || '' });
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const idOk = !form.upiId || UPI_ID.test(form.upiId.trim());
  const preview = form.upiId && idOk ? buildUpiLink({ upiId: form.upiId.trim(), payeeName }) : '';
  const change = (patch) => { setForm({ ...form, ...patch }); setSaved(false); };

  const run = async (fn, after) => {
    setBusy(true);
    setError('');
    try { await fn(); if (after) after(); setSaved(true); setTimeout(() => setSaved(false), 2500); } catch (err) { setError(errorOf(err)); } finally { setBusy(false); }
  };

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); void run(() => onSave({ upiId: form.upiId.trim(), upiPaymentLink: form.upiPaymentLink.trim() })); }}
      className="space-y-3 rounded-2xl bg-white p-4 shadow dark:border dark:border-gray-700 dark:bg-gray-800"
    >
      <div>
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
        {note && <p className="text-xs text-gray-500 dark:text-gray-400">{note}</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">UPI ID</label>
          <input placeholder="yourgym@okhdfcbank" value={form.upiId} onChange={(e) => change({ upiId: e.target.value })} autoCapitalize="none" className={`${inputClass} w-full`} aria-invalid={!idOk} />
          {!idOk && <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">This does not look like a UPI ID (name@bank).</p>}
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Payment link (optional)</label>
          <input placeholder="https://..." value={form.upiPaymentLink} onChange={(e) => change({ upiPaymentLink: e.target.value })} className={`${inputClass} w-full`} />
        </div>
      </div>
      {preview && (
        <div className="flex items-center gap-4">
          <div className="rounded border bg-white p-2 dark:border-gray-600"><QRCodeSVG value={preview} size={110} /></div>
          <p className="text-xs text-gray-400 dark:text-gray-500">Preview. The QR shown when taking a payment includes the exact amount.</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy || !idOk} className={primaryBtn}>{busy ? 'Saving…' : 'Save'}</button>
        {onClear && <button type="button" disabled={busy} onClick={() => void run(onClear, () => setForm({ upiId: '', upiPaymentLink: '' }))} className={ghostBtn}>{clearLabel}</button>}
        {saved && <span className="text-sm text-green-600 dark:text-green-400">Saved.</span>}
        {error && <span role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</span>}
      </div>
    </form>
  );
}

export default function PaymentSettings() {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    tenantSettingsAPI.paymentAccounts().then((res) => setData(res.data)).catch(() => setLoadError('Could not load payment settings.'));
  }, []);

  if (loadError) return <div role="alert" className="p-6 text-sm text-red-600 dark:text-red-400">{loadError}</div>;
  if (!data) return <div className="p-6 text-gray-500 dark:text-gray-400">Loading...</div>;

  // The gym's default is what a branch with no account of its own collects into.
  const saveDefault = async (body) => {
    await tenantSettingsAPI.update(body);
    setData((d) => ({ ...d, default: body }));
  };
  const saveBranch = (branch) => async (body) => {
    const res = await tenantSettingsAPI.updateBranchPayment(branch._id, body);
    setData((d) => ({ ...d, branches: d.branches.map((b) => (b._id === branch._id ? res.data : b)) }));
  };

  return (
    <div className="max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Payment Settings</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Set the UPI account staff collect member payments into. A QR code is generated automatically with each payment's amount
          pre-filled. No payment gateway or fees: staff confirm once the member has paid.
        </p>
      </div>

      <AccountForm
        title="Gym account (default)"
        note="Used by every branch that has no account of its own."
        payeeName={data.gymName}
        initial={data.default}
        onSave={saveDefault}
      />

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Branch accounts</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Does a branch bank separately? Give it its own UPI ID and its members' payments are collected there, with a QR that
            points to that account. Each payment records which account it was meant for.
          </p>
        </div>
        {data.branches.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No branches yet.</p>}
        {data.branches.map((b) => (
          <AccountForm
            key={b._id}
            title={b.name}
            note={b.usesDefault ? 'Uses the gym account above.' : 'Collects into its own account.'}
            payeeName={data.gymName}
            initial={b}
            onSave={saveBranch(b)}
            onClear={b.usesDefault ? null : () => saveBranch(b)({ upiId: '', upiPaymentLink: '' })}
            clearLabel="Use the gym account"
          />
        ))}
      </section>
    </div>
  );
}
