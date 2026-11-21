import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Paperclip, Plus, Wallet } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useChartColors } from '../../utils/chartColors';
import { branchesAPI, expensesAPI } from '../../services/api';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import MonthNav, { dayString, endOfMonth, startOfMonth } from '../../components/MonthNav';
import { fieldClass, primaryBtn, toolBtn } from '../../components/ListToolbar';
import { receiptJpegBase64 } from '../../utils/photo';
import { fmtRupees } from '../../utils/receipt';

const CATEGORIES = [
  { value: 'salary-trainer', label: 'Trainer salary', salary: true },
  { value: 'salary-manager', label: 'Manager salary', salary: true },
  { value: 'salary-other', label: 'Other staff salary', salary: true },
  { value: 'maintenance', label: 'Maintenance & repairs' },
  { value: 'rent', label: 'Rent' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'equipment', label: 'Equipment purchase' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'other', label: 'Other' },
];
const label = (value) => CATEGORIES.find((c) => c.value === value)?.label || value;
const METHODS = [['cash', 'Cash'], ['upi', 'UPI'], ['bank', 'Bank transfer'], ['cheque', 'Cheque'], ['other', 'Other']];
const errorMessage = (err) => err?.response?.data?.message || err?.message || 'Something went wrong. Please try again.';
const INK = { light: { muted: '#7A8499', grid: '#E3E6EC' }, dark: { muted: '#A3ABBC', grid: '#242935' } };
const today = () => dayString(new Date());
const emptyForm = () => ({ category: 'maintenance', amount: '', date: today(), branchId: '', paidTo: '', method: 'cash', note: '' });

function Stat({ title, value, hint, tone = '' }) {
  return (
    <div className="rounded-3xl border border-gray-200/80 bg-white p-4 shadow-sm dark:border-white/5 dark:bg-gray-800/80">
      <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
      <p className={`mt-1 text-2xl font-extrabold tracking-tight ${tone || 'text-gray-900 dark:text-white'}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
    </div>
  );
}

export default function Expenses() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const ink = INK[theme];
  const chart = useChartColors();
  const admin = user.role === 'tenant-admin';
  const [month, setMonth] = useState(startOfMonth());
  const [branchId, setBranchId] = useState('');
  const [branches, setBranches] = useState([]);
  const [rows, setRows] = useState(null);
  const [summary, setSummary] = useState(null);
  const [editing, setEditing] = useState(null); // null = closed, 'new' = adding, else the expense
  const [form, setForm] = useState(emptyForm());
  const [receipt, setReceipt] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const params = { from: dayString(month), to: dayString(endOfMonth(month)), ...(branchId ? { branchId } : {}) };
    const [list, sum] = await Promise.all([expensesAPI.list(params), expensesAPI.summary(params)]);
    setRows(list.data.items);
    setSummary(sum.data);
  }, [month, branchId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (admin) branchesAPI.list().then((r) => setBranches(r.data)); }, [admin]);

  const branchName = (id) => (id ? branches.find((b) => b._id === id)?.name || 'Branch' : 'Whole gym');
  const categories = admin ? CATEGORIES : CATEGORIES.filter((c) => !c.salary);

  const openAdd = () => { setForm(emptyForm()); setReceipt(null); setError(''); setEditing('new'); };
  const openEdit = (e) => {
    setForm({ category: e.category, amount: String(e.amount), date: e.date.slice(0, 10), branchId: e.branchId || '', paidTo: e.paidTo || '', method: e.method || 'cash', note: e.note || '' });
    setReceipt(null);
    setError('');
    setEditing(e);
  };

  const save = async (ev) => {
    ev.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const body = { ...form, amount: Number(form.amount) };
      let saved;
      if (editing === 'new') saved = (await expensesAPI.create(body)).data;
      else { const { branchId: _skip, ...changes } = body; saved = (await expensesAPI.update(editing._id, changes)).data; }
      if (receipt) {
        try { await expensesAPI.uploadReceipt(saved._id, await receiptJpegBase64(receipt)); } catch (err) { setNotice(`Saved, but the bill photo was not attached: ${errorMessage(err)}`); }
      }
      setEditing(null);
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const voidIt = async (e) => {
    const reason = window.prompt(`Void this ${fmtRupees(e.amount)} expense? It stays on record but is left out of every total.\nReason (optional):`);
    if (reason === null) return;
    await expensesAPI.void(e._id, reason);
    load();
  };

  const attach = async (e, file) => {
    if (!file) return;
    try { await expensesAPI.uploadReceipt(e._id, await receiptJpegBase64(file)); setNotice('Bill photo attached.'); load(); } catch (err) { setNotice(errorMessage(err)); }
  };
  const viewReceipt = async (e) => {
    try { const res = await expensesAPI.receipt(e._id); window.open(URL.createObjectURL(res.data), '_blank', 'noopener'); } catch (err) { setNotice(errorMessage(err)); }
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Expenses</h1>
        <div className="flex flex-wrap items-center gap-2">
          <MonthNav value={month} onChange={setMonth} />
          {admin && (
            <select aria-label="Branch" value={branchId} onChange={(e) => setBranchId(e.target.value)} className={`${fieldClass} !w-auto`}>
              <option value="">All branches</option>
              {branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
            </select>
          )}
          {admin && <Link to="/payroll" className={`${toolBtn} inline-flex items-center gap-1.5`}><Wallet className="h-4 w-4" /> Payroll</Link>}
          <button type="button" onClick={openAdd} className={`${primaryBtn} inline-flex items-center gap-1.5`}><Plus className="h-4 w-4" /> Add expense</button>
        </div>
      </div>

      {notice && <p role="status" className="rounded-xl bg-accent/10 px-3 py-2 text-sm text-gray-800 dark:text-gray-200">{notice} <button type="button" onClick={() => setNotice('')} className="ml-2 underline">Dismiss</button></p>}

      {summary && (
        <>
          <div className={`grid grid-cols-1 gap-3 ${admin ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
            <Stat title="Collected" value={fmtRupees(summary.collected)} hint="Membership payments received" />
            <Stat title="Spent" value={fmtRupees(summary.totalExpenses)} hint={summary.partial ? 'Your branch, not counting salaries' : 'Everything paid out'} />
            {admin && <Stat title="Net" value={fmtRupees(summary.net)} hint="Collected minus spent" tone={summary.net < 0 ? 'text-red-500 dark:text-red-400' : 'text-green-700 dark:text-accent'} />}
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
            <section className="rounded-3xl border border-gray-200/80 bg-white p-4 shadow-sm dark:border-white/5 dark:bg-gray-800/80 lg:col-span-2">
              <h2 className="mb-3 text-base font-semibold text-gray-900 dark:text-gray-100">Where it went</h2>
              {summary.byCategory.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-400">Nothing spent this month.</p> : (
                <ul className="space-y-2.5">
                  {summary.byCategory.map((c) => (
                    <li key={c.category}>
                      <div className="flex justify-between text-sm"><span className="text-gray-700 dark:text-gray-200">{label(c.category)}</span><span className="font-semibold text-gray-900 dark:text-gray-100">{fmtRupees(c.total)}</span></div>
                      <div className="mt-1 h-1.5 rounded-full bg-gray-100 dark:bg-white/10"><div className="h-1.5 rounded-full bg-accent-strong dark:bg-accent" style={{ width: `${Math.max(3, (c.total / summary.totalExpenses) * 100)}%` }} /></div>
                    </li>
                  ))}
                </ul>
              )}
              {admin && summary.byBranch.length > 1 && (
                <>
                  <h3 className="mb-2 mt-5 text-sm font-semibold text-gray-900 dark:text-gray-100">By branch</h3>
                  <ul className="space-y-1 text-sm">
                    {summary.byBranch.map((b) => <li key={String(b.branchId)} className="flex justify-between text-gray-700 dark:text-gray-200"><span>{branchName(b.branchId)}</span><span>{fmtRupees(b.total)}</span></li>)}
                  </ul>
                </>
              )}
            </section>
            <section className="rounded-3xl border border-gray-200/80 bg-white p-4 shadow-sm dark:border-white/5 dark:bg-gray-800/80 lg:col-span-3">
              <h2 className="mb-2 text-base font-semibold text-gray-900 dark:text-gray-100">Last six months</h2>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary.monthly} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={ink.grid} />
                    <XAxis dataKey="month" tick={{ fill: ink.muted, fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: ink.muted, fontSize: 12 }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => new Intl.NumberFormat('en-IN', { notation: 'compact' }).format(v)} />
                    <Tooltip formatter={(v, n) => [fmtRupees(v), n === 'collected' ? 'Collected' : 'Spent']} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                    <Bar dataKey="collected" fill={chart.accent} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="expenses" fill={chart.danger} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-1 flex gap-4 text-xs text-gray-500 dark:text-gray-400"><span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-accent-strong dark:bg-accent" />Collected</span><span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#FF6B7A]" />Spent</span></p>
            </section>
          </div>
        </>
      )}

      {rows === null ? <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Loading...</p> : (
        <DataTable
          tableId="expenses"
          columns={[
            { key: 'date', label: 'Date', render: (r) => new Date(r.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) },
            { key: 'category', label: 'Category', render: (r) => label(r.category) },
            { key: 'paidTo', label: 'Paid to', render: (r) => r.paidTo || '—' },
            ...(admin ? [{ key: 'branch', label: 'Branch', render: (r) => branchName(r.branchId), hideOnMobile: true }] : []),
            { key: 'amount', label: 'Amount', render: (r) => (r.voided ? <span className="text-gray-400 line-through">{fmtRupees(r.amount)} <span className="text-xs no-underline">(voided)</span></span> : fmtRupees(r.amount)) },
            {
              key: 'actions',
              label: 'Actions',
              render: (r) => (r.voided ? <span className="text-xs text-gray-400">{r.voidReason || 'Voided'}</span> : (
                <div className="flex items-center gap-3 whitespace-nowrap">
                  {r.hasReceipt
                    ? <button type="button" onClick={() => viewReceipt(r)} className="inline-flex items-center gap-1 font-medium text-accent-strong hover:underline dark:font-normal dark:text-blue-400"><Paperclip className="h-3.5 w-3.5" />Bill</button>
                    : <label className="cursor-pointer font-medium text-accent-strong hover:underline dark:font-normal dark:text-gray-400">Add bill<input type="file" accept="image/*" className="sr-only" onChange={(e) => { attach(r, e.target.files?.[0]); e.target.value = ''; }} /></label>}
                  {!r.payrollKey && <button type="button" onClick={() => openEdit(r)} className="font-medium text-accent-strong hover:underline dark:font-normal dark:text-blue-400">Edit</button>}
                  <button type="button" onClick={() => voidIt(r)} className="text-red-600 hover:underline dark:text-red-400">Void</button>
                </div>
              )),
            },
          ]}
          rows={rows}
        />
      )}
      {rows && rows.length === 0 && <p className="text-center text-sm text-gray-500 dark:text-gray-400">No expenses recorded for this month yet.</p>}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add expense' : 'Edit expense'}>
        <form onSubmit={save} className="space-y-3">
          {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ex-cat" className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Category</label>
              <select id="ex-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={fieldClass}>{categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
            </div>
            <div>
              <label htmlFor="ex-amount" className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Amount (₹)</label>
              <input id="ex-amount" type="number" min="1" step="any" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={fieldClass} />
            </div>
            <div>
              <label htmlFor="ex-date" className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Date</label>
              <input id="ex-date" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={fieldClass} />
            </div>
            <div>
              <label htmlFor="ex-method" className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Paid by</label>
              <select id="ex-method" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} className={fieldClass}>{METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </div>
          </div>
          {admin && editing === 'new' && (
            <div>
              <label htmlFor="ex-branch" className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Branch</label>
              <select id="ex-branch" value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} className={fieldClass}>
                <option value="">Whole gym (not one branch)</option>
                {branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="ex-to" className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Paid to (optional)</label>
            <input id="ex-to" maxLength={100} value={form.paidTo} onChange={(e) => setForm({ ...form, paidTo: e.target.value })} placeholder="Vendor, landlord, person" className={fieldClass} />
          </div>
          <div>
            <label htmlFor="ex-note" className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Note (optional)</label>
            <input id="ex-note" maxLength={300} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={fieldClass} />
          </div>
          <div>
            <label htmlFor="ex-bill" className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Photo of the bill (optional)</label>
            <input id="ex-bill" type="file" accept="image/*" onChange={(e) => setReceipt(e.target.files?.[0] || null)} className="block w-full text-sm text-gray-600 dark:text-gray-300" />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving} className={primaryBtn}>{saving ? 'Saving...' : 'Save'}</button>
            <button type="button" onClick={() => setEditing(null)} className={toolBtn}>Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
