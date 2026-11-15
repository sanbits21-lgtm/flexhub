import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { branchesAPI, payrollAPI } from '../../services/api';
import Modal from '../../components/Modal';
import MonthNav, { dayString, endOfMonth, monthKey, startOfMonth } from '../../components/MonthNav';
import { fieldClass, primaryBtn, toolBtn } from '../../components/ListToolbar';
import { fmtRupees } from '../../utils/receipt';

const errorMessage = (err) => err?.response?.data?.message || err?.message || 'Something went wrong. Please try again.';
const METHODS = [['bank', 'Bank transfer'], ['cash', 'Cash'], ['upi', 'UPI'], ['cheque', 'Cheque'], ['other', 'Other']];
const num = (v) => Number(v) || 0;
const emptyPayee = { name: '', roleLabel: '', branchId: '', monthlySalary: '' };

export default function Payroll() {
  const [month, setMonth] = useState(startOfMonth());
  const [data, setData] = useState(null);
  const [branches, setBranches] = useState([]);
  const [edits, setEdits] = useState({}); // per line: { bonus, deduction, picked }
  const [method, setMethod] = useState('bank');
  const [paying, setPaying] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [staffOpen, setStaffOpen] = useState(false);
  const [payees, setPayees] = useState([]);
  const [payee, setPayee] = useState(null); // the person being added or edited
  const [payeeForm, setPayeeForm] = useState(emptyPayee);
  const [payeeError, setPayeeError] = useState('');

  const load = useCallback(async () => {
    setData(null);
    const res = await payrollAPI.preview(monthKey(month));
    setData(res.data);
    setEdits({});
  }, [month]);
  useEffect(() => { load().catch((err) => setError(errorMessage(err))); }, [load]);
  useEffect(() => { branchesAPI.list().then((r) => setBranches(r.data)); }, []);

  const branchName = (id) => (id ? branches.find((b) => b._id === id)?.name || '' : '');
  const edit = (key) => edits[key] || {};
  const setEdit = (key, patch) => setEdits((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  const net = (l) => l.base + num(edit(l.key).bonus) - num(edit(l.key).deduction);
  const unpaid = (data?.lines || []).filter((l) => !l.paid);
  const picked = unpaid.filter((l) => edit(l.key).picked !== false); // everyone unpaid is ticked until unticked
  const total = picked.reduce((s, l) => s + net(l), 0);

  const pay = async () => {
    if (!picked.length || paying) return;
    if (!window.confirm(`Record ${picked.length} salary payment${picked.length === 1 ? '' : 's'} totalling ${fmtRupees(total)} for ${month.toLocaleString('en-IN', { month: 'long', year: 'numeric' })}?`)) return;
    setPaying(true);
    setError('');
    try {
      const payDate = dayString(new Date() < endOfMonth(month) && new Date() >= month ? new Date() : endOfMonth(month));
      const res = await payrollAPI.run({
        month: monthKey(month),
        lines: picked.map((l) => ({ kind: l.kind, id: l.id, bonus: num(edit(l.key).bonus), deduction: num(edit(l.key).deduction), method, date: payDate })),
      });
      setResult(res.data.results);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPaying(false);
    }
  };

  const nameOf = (key) => data?.lines.find((l) => l.key === key)?.name || key;

  // ---- other staff ----
  const openStaff = async () => { setPayee(null); setPayeeError(''); setStaffOpen(true); setPayees((await payrollAPI.payees()).data); };
  const startPayee = (p) => { setPayee(p || 'new'); setPayeeError(''); setPayeeForm(p ? { name: p.name, roleLabel: p.roleLabel || '', branchId: p.branchId || '', monthlySalary: String(p.monthlySalary || '') } : emptyPayee); };
  const savePayee = async (e) => {
    e.preventDefault();
    setPayeeError('');
    try {
      const body = { ...payeeForm, monthlySalary: num(payeeForm.monthlySalary) };
      if (payee === 'new') await payrollAPI.createPayee(body); else await payrollAPI.updatePayee(payee._id, body);
      setPayee(null);
      setPayees((await payrollAPI.payees()).data);
      load();
    } catch (err) {
      setPayeeError(errorMessage(err));
    }
  };
  const removePayee = async (p) => {
    if (!window.confirm(`Remove ${p.name} from payroll? Past payments stay on record.`)) return;
    await payrollAPI.removePayee(p._id);
    setPayees((await payrollAPI.payees()).data);
    load();
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Payroll</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Pay trainers, managers and other staff for a month. Each payment becomes an expense. <Link to="/expenses" className="text-blue-600 underline dark:text-blue-400">Back to Expenses</Link></p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MonthNav value={month} onChange={setMonth} />
          <button type="button" onClick={openStaff} className={`${toolBtn} inline-flex items-center gap-1.5`}><Users className="h-4 w-4" /> Other staff</button>
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {result && (
        <div role="status" className="rounded-2xl border border-gray-200 p-3 text-sm dark:border-gray-700">
          <p className="font-semibold text-gray-900 dark:text-gray-100">{result.filter((r) => r.ok).length} paid{result.some((r) => !r.ok) ? `, ${result.filter((r) => !r.ok).length} not paid:` : '.'}</p>
          <ul className="mt-1 space-y-0.5 text-gray-700 dark:text-gray-300">{result.filter((r) => !r.ok).map((r) => <li key={r.key}>{nameOf(r.key)}: {r.error}</li>)}</ul>
          <button type="button" onClick={() => setResult(null)} className="mt-1 text-xs underline">Dismiss</button>
        </div>
      )}

      {data === null ? <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Loading...</p> : (
        <>
          {data.lines.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">No one has a salary set yet. Set a trainer's or manager's salary on their account, or add other staff.</p>
          ) : (
            <div className="overflow-x-auto rounded-3xl border border-gray-200/80 bg-white shadow-sm dark:border-white/5 dark:bg-gray-800/80">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  <tr><th className="p-3 w-8" /><th className="p-3">Name</th><th className="p-3 hidden sm:table-cell">Branch</th><th className="p-3 text-right">Salary</th><th className="p-3">Bonus</th><th className="p-3">Deduction</th><th className="p-3 text-right">To pay</th></tr>
                </thead>
                <tbody>
                  {data.lines.map((l) => (
                    <tr key={l.key} className="border-t border-gray-100 dark:border-white/5">
                      <td className="p-3">{l.paid ? <Check className="h-4 w-4 text-green-600 dark:text-accent" aria-label="Paid" /> : <input type="checkbox" aria-label={`Pay ${l.name}`} checked={edit(l.key).picked !== false} onChange={(e) => setEdit(l.key, { picked: e.target.checked })} />}</td>
                      <td className="p-3"><div className="font-medium text-gray-900 dark:text-gray-100">{l.name}</div><div className="text-xs text-gray-500 dark:text-gray-400">{l.roleLabel}</div></td>
                      <td className="p-3 hidden sm:table-cell text-gray-600 dark:text-gray-300">{branchName(l.branchId) || '—'}</td>
                      <td className="p-3 text-right">{fmtRupees(l.base)}</td>
                      {l.paid ? (
                        <td colSpan={3} className="p-3 text-right text-green-700 dark:text-accent">Paid {fmtRupees(l.paid.amount)} on {new Date(l.paid.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td>
                      ) : (
                        <>
                          <td className="p-3"><input type="number" min="0" aria-label={`Bonus for ${l.name}`} value={edit(l.key).bonus ?? ''} onChange={(e) => setEdit(l.key, { bonus: e.target.value })} className={`${fieldClass} !w-24`} placeholder="0" /></td>
                          <td className="p-3"><input type="number" min="0" aria-label={`Deduction for ${l.name}`} value={edit(l.key).deduction ?? ''} onChange={(e) => setEdit(l.key, { deduction: e.target.value })} className={`${fieldClass} !w-24`} placeholder="0" /></td>
                          <td className="p-3 text-right font-semibold text-gray-900 dark:text-gray-100">{fmtRupees(net(l))}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.withoutSalary.length > 0 && <p className="text-xs text-gray-500 dark:text-gray-400">No salary set, so not listed: {data.withoutSalary.join(', ')}.</p>}

          {unpaid.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 p-3 dark:border-gray-700">
              <p className="text-sm text-gray-700 dark:text-gray-200">{picked.length} selected · <span className="font-semibold">{fmtRupees(total)}</span></p>
              <div className="flex items-center gap-2">
                <label htmlFor="pr-method" className="text-xs text-gray-500 dark:text-gray-400">Paid by</label>
                <select id="pr-method" value={method} onChange={(e) => setMethod(e.target.value)} className={`${fieldClass} !w-auto`}>{METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                <button type="button" onClick={pay} disabled={!picked.length || paying} className={primaryBtn}>{paying ? 'Recording...' : 'Record payments'}</button>
              </div>
            </div>
          )}
        </>
      )}

      <Modal open={staffOpen} onClose={() => setStaffOpen(false)} title="Other staff">
        {payee === null ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-300">People you pay who do not use the app: cleaners, receptionists, a physiotherapist. Trainers and managers are paid from the salary on their own account.</p>
            {payees.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-400">No one added yet.</p> : (
              <ul className="divide-y divide-gray-100 dark:divide-white/5">
                {payees.map((p) => (
                  <li key={p._id} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0"><p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{p.name}{!p.isActive && ' (removed)'}</p><p className="text-xs text-gray-500 dark:text-gray-400">{[p.roleLabel, branchName(p.branchId), fmtRupees(p.monthlySalary)].filter(Boolean).join(' · ')}</p></div>
                    <div className="flex gap-2"><button type="button" aria-label={`Edit ${p.name}`} onClick={() => startPayee(p)} className="p-1 text-gray-500 hover:text-gray-900 dark:hover:text-white"><Pencil className="h-4 w-4" /></button><button type="button" aria-label={`Remove ${p.name}`} onClick={() => removePayee(p)} className="p-1 text-gray-500 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></div>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2"><button type="button" onClick={() => startPayee(null)} className={`${primaryBtn} inline-flex items-center gap-1.5`}><Plus className="h-4 w-4" /> Add person</button><button type="button" onClick={() => setStaffOpen(false)} className={toolBtn}>Close</button></div>
          </div>
        ) : (
          <form onSubmit={savePayee} className="space-y-3">
            {payeeError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{payeeError}</p>}
            <input placeholder="Name" aria-label="Name" required maxLength={100} value={payeeForm.name} onChange={(e) => setPayeeForm({ ...payeeForm, name: e.target.value })} className={fieldClass} />
            <input placeholder="Role (cleaner, receptionist...)" aria-label="Role" maxLength={60} value={payeeForm.roleLabel} onChange={(e) => setPayeeForm({ ...payeeForm, roleLabel: e.target.value })} className={fieldClass} />
            <select aria-label="Branch" value={payeeForm.branchId} onChange={(e) => setPayeeForm({ ...payeeForm, branchId: e.target.value })} className={fieldClass}>
              <option value="">Whole gym</option>
              {branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
            </select>
            <input type="number" min="0" placeholder="Monthly salary (₹)" aria-label="Monthly salary" value={payeeForm.monthlySalary} onChange={(e) => setPayeeForm({ ...payeeForm, monthlySalary: e.target.value })} className={fieldClass} />
            <div className="flex gap-2"><button type="submit" className={primaryBtn}>Save</button><button type="button" onClick={() => setPayee(null)} className={toolBtn}>Back</button></div>
          </form>
        )}
      </Modal>
    </div>
  );
}
