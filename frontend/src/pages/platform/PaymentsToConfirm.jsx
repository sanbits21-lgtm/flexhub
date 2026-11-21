import { useCallback, useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { billingAdminAPI } from '../../services/api';
import Modal from '../../components/Modal';
import { fieldClass, primaryBtn, toolBtn } from '../../components/ListToolbar';
import { fmtRupees } from '../../utils/receipt';

const errorMessage = (err) => err?.response?.data?.message || err?.message || 'Something went wrong. Please try again.';
const stamp = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const TABS = [['awaiting_confirmation', 'Waiting'], ['paid', 'Confirmed'], ['rejected', 'Rejected'], ['all', 'All']];
const KIND = { upgrade: 'Trial to paid', renewal: 'Renewal', change: 'Package change' };

// Platform staff confirming that a gym's UPI payment really reached the bank, before its plan switches on.
export default function PaymentsToConfirm() {
  const [status, setStatus] = useState('awaiting_confirmation');
  const [rows, setRows] = useState(null);
  const [approving, setApproving] = useState(null);
  const [received, setReceived] = useState('');
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() => billingAdminAPI.list(status).then((r) => setRows(r.data)).catch((err) => setError(errorMessage(err))), [status]);
  useEffect(() => { setRows(null); load(); }, [load]);

  const viewProof = async (o) => { try { const res = await billingAdminAPI.proof(o._id); window.open(URL.createObjectURL(res.data), '_blank', 'noopener'); } catch (err) { setError(errorMessage(err)); } };

  const approve = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await billingAdminAPI.approve(approving._id, Number(received));
      setNotice(`${res.data.tenant?.name || 'The gym'} is active until ${new Date(res.data.periodEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}. The owner has been emailed.`);
      setApproving(null);
      load();
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };
  const reject = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try { await billingAdminAPI.reject(rejecting._id, reason); setNotice('Rejected. The owner has been emailed the reason.'); setRejecting(null); load(); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Payments to confirm</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Gyms that say they paid by UPI. Check your bank for the amount and the transaction number, then confirm. Nothing switches on until you do.</p>
      </div>
      <div role="tablist" className="flex flex-wrap gap-2">
        {TABS.map(([v, l]) => <button key={v} type="button" role="tab" aria-selected={status === v} onClick={() => setStatus(v)} className={`rounded-full border px-3 py-1 text-sm ${status === v ? 'border-accent bg-accent/15 font-semibold text-gray-900 dark:text-white' : 'border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300'}`}>{l}</button>)}
      </div>
      {notice && <p role="status" className="rounded-xl bg-accent/10 px-3 py-2 text-sm text-gray-800 dark:text-gray-200">{notice} <button type="button" className="ml-2 underline" onClick={() => setNotice('')}>Dismiss</button></p>}
      {error && !approving && !rejecting && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {rows === null ? <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Loading...</p> : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">Nothing here.</p>
      ) : (
        <div className="overflow-x-auto rounded-3xl border border-gray-100 bg-white shadow-[0_8px_28px_-14px_rgba(30,41,59,0.16)] dark:border-white/5 dark:bg-gray-800/80">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400"><tr><th className="p-3">Gym</th><th className="p-3">For</th><th className="p-3 text-right">Due</th><th className="p-3">Transaction no.</th><th className="p-3">Sent</th><th className="p-3">Actions</th></tr></thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o._id} className="border-t border-gray-100 align-top dark:border-white/5">
                  <td className="p-3"><div className="font-medium text-gray-900 dark:text-gray-100">{o.tenant?.name || '—'}</div><div className="text-xs text-gray-500 dark:text-gray-400">{o.tenant?.contactEmail}</div></td>
                  <td className="p-3">{o.packageName}{o.periods > 1 ? ` × ${o.periods}` : ''}<div className="text-xs text-gray-500 dark:text-gray-400">{KIND[o.kind]}</div></td>
                  <td className="p-3 text-right font-semibold">{fmtRupees(o.total)}<div className="text-xs font-normal text-gray-500 dark:text-gray-400">{o.reference}</div></td>
                  <td className="p-3 font-mono text-xs">{o.utr || '—'}</td>
                  <td className="p-3 text-xs text-gray-600 dark:text-gray-300">{stamp(o.submittedAt || o.createdAt)}</td>
                  <td className="p-3">
                    {o.status === 'awaiting_confirmation' ? (
                      <div className="flex flex-wrap items-center gap-3 whitespace-nowrap">
                        {o.hasProof && <button type="button" onClick={() => viewProof(o)} className="inline-flex items-center gap-0.5 text-blue-600 underline dark:text-blue-400">Proof <ExternalLink className="h-3 w-3" /></button>}
                        <button type="button" onClick={() => { setError(''); setReceived(''); setApproving(o); }} className="font-semibold text-green-700 hover:underline dark:text-accent">Confirm</button>
                        <button type="button" onClick={() => { setError(''); setReason(''); setRejecting(o); }} className="text-red-600 hover:underline dark:text-red-400">Reject</button>
                      </div>
                    ) : <span className="text-xs text-gray-500 dark:text-gray-400">{o.status === 'paid' ? `Confirmed ${stamp(o.paidAt)}` : o.status === 'rejected' ? `Rejected: ${o.rejectReason || ''}` : o.status}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!approving} onClose={() => setApproving(null)} title={`Confirm payment: ${approving?.tenant?.name || ''}`}>
        <form onSubmit={approve} className="space-y-3">
          {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <p className="text-sm text-gray-700 dark:text-gray-300">{approving?.packageName} for {approving?.months} month{approving?.months === 1 ? '' : 's'}. Due: <strong>{approving && fmtRupees(approving.total)}</strong>. Transaction number <span className="font-mono">{approving?.utr}</span>, reference <span className="font-mono">{approving?.reference}</span>.</p>
          <div>
            <label htmlFor="pc-received" className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Amount that reached your bank (₹)</label>
            <input id="pc-received" type="number" min="0" step="any" required autoFocus value={received} onChange={(e) => setReceived(e.target.value)} className={fieldClass} />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Confirming switches the plan on straight away and emails the owner. It cannot be undone from here.</p>
          <div className="flex gap-2"><button type="submit" disabled={busy || !received} className={primaryBtn}>{busy ? 'Confirming...' : 'Confirm and switch on'}</button><button type="button" onClick={() => setApproving(null)} className={toolBtn}>Cancel</button></div>
        </form>
      </Modal>

      <Modal open={!!rejecting} onClose={() => setRejecting(null)} title={`Reject payment: ${rejecting?.tenant?.name || ''}`}>
        <form onSubmit={reject} className="space-y-3">
          {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <label htmlFor="pc-reason" className="block text-xs text-gray-500 dark:text-gray-400">Reason (the owner is emailed this)</label>
          <input id="pc-reason" required minLength={3} maxLength={200} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="The amount did not reach our account" className={fieldClass} />
          <div className="flex gap-2"><button type="submit" disabled={busy} className={primaryBtn}>{busy ? 'Rejecting...' : 'Reject'}</button><button type="button" onClick={() => setRejecting(null)} className={toolBtn}>Cancel</button></div>
        </form>
      </Modal>
    </div>
  );
}
