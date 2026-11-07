import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useFeature } from '../../hooks/useFeature';
import { paymentsAPI, membersAPI, membershipPlansAPI, tenantSettingsAPI } from '../../services/api';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import PaymentReceipt from '../../components/PaymentReceipt';
import ListToolbar, { fieldClass, primaryBtn, toolBtn } from '../../components/ListToolbar';
import { fmtRupees } from '../../utils/receipt';
import { formatFieldValue } from '../../utils/memberFields';

const emptyForm = { memberId: '', membershipPlanId: '', amount: '', method: 'cash', status: 'paid' };
const emptyFilters = { status: '', method: '', from: '', to: '' };
const PAGE_SIZE = 20;
const STATUS_LABEL = { paid: 'Paid', pending: 'Pending', failed: 'Failed', refunded: 'Refunded' };
const METHOD_LABEL = { cash: 'Cash', card: 'Card', upi: 'UPI', netbanking: 'Net banking', other: 'Other' };
const NO_MONEY = { paid: { amount: 0, count: 0 }, pending: { amount: 0, count: 0 }, refunded: { amount: 0, count: 0 }, failed: { amount: 0, count: 0 } };
const errorMessage = (err) => err?.response?.data?.message || err?.message || 'Something went wrong. Please try again.';
const day = (iso) => formatFieldValue({ type: 'date' }, iso);

function Total({ label, amount, count, unit, tone }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2">
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className={`text-lg font-semibold ${tone}`}>{fmtRupees(amount)}</div>
      <div className="text-xs text-gray-400 dark:text-gray-500">{count} {unit}{count === 1 ? '' : 's'}</div>
    </div>
  );
}

export default function Payments() {
  const { user } = useAuth();
  const canUseUpi = useFeature('features:upiPayments');
  const canRefund = useFeature('features:paymentRefunds');
  const [payments, setPayments] = useState(null); // null until the first response
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState(NO_MONEY);
  const [page, setPage] = useState(1);
  const [members, setMembers] = useState([]);
  const [plans, setPlans] = useState([]);
  const [filters, setFilters] = useState(emptyFilters);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [receiptFor, setReceiptFor] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const requestRef = useRef(0); // only the newest response may update the screen

  const load = () => {
    const ticket = ++requestRef.current;
    const params = { page, limit: PAGE_SIZE };
    Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
    if (debouncedSearch) params.search = debouncedSearch;
    return paymentsAPI.list(params).then((res) => {
      if (ticket !== requestRef.current) return;
      setPayments(res.data.payments);
      setTotal(res.data.total);
      setSummary(res.data.summary || NO_MONEY);
    });
  };

  useEffect(() => {
    membersAPI.list({ limit: 200 }).then((res) => setMembers(res.data.members));
    membershipPlansAPI.list().then((res) => setPlans(res.data));
    tenantSettingsAPI.get().then((res) => setTenantName(res.data.name));
  }, []);
  useEffect(() => { load(); }, [page, filters, debouncedSearch]);
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const memberName = (id) => members.find((m) => m._id === id)?.name || id;
  const planName = (id) => plans.find((p) => p._id === id)?.name;
  const changeFilters = (patch) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await paymentsAPI.create({ ...form, amount: Number(form.amount) });
      setForm(emptyForm);
      setShowAdd(false);
      if (page !== 1) setPage(1); else load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleMarkPaid = async (payment) => {
    await paymentsAPI.update(payment._id, { status: 'paid' });
    load();
  };

  const handleRefund = async (payment) => {
    if (!window.confirm(`Refund ${fmtRupees(payment.amount)} (${payment.invoiceNumber})? This reverses the collection and removes it from revenue.`)) return;
    await paymentsAPI.update(payment._id, { status: 'refunded' });
    load();
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const chips = [
    filters.status && { key: 'status', text: STATUS_LABEL[filters.status], clear: () => changeFilters({ status: '' }) },
    filters.method && { key: 'method', text: METHOD_LABEL[filters.method], clear: () => changeFilters({ method: '' }) },
    (filters.from || filters.to) && {
      key: 'dates',
      text: filters.from && filters.to ? `${day(filters.from)} – ${day(filters.to)}` : filters.from ? `From ${day(filters.from)}` : `Until ${day(filters.to)}`,
      clear: () => changeFilters({ from: '', to: '' }),
    },
  ].filter(Boolean);
  const clearAll = () => { setSearch(''); setDebouncedSearch(''); setFilters(emptyFilters); setPage(1); };
  // Staff other than a branch manager only read payments here; recording is the manager's job.
  const canRecord = user.role === 'branch-manager';

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <ListToolbar
        title="Payments"
        count={payments ? total : null}
        addLabel="Record Payment"
        onAdd={canRecord ? () => { setForm(emptyForm); setError(''); setShowAdd(true); } : undefined}
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search member or invoice"
        chips={chips}
        onClearAll={clearAll}
        filters={(
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="pay-status" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Status</label>
              <select id="pay-status" value={filters.status} onChange={(e) => changeFilters({ status: e.target.value })} className={fieldClass}>
                <option value="">All statuses</option>
                {Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="pay-method" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Method</label>
              <select id="pay-method" value={filters.method} onChange={(e) => changeFilters({ method: e.target.value })} className={fieldClass}>
                <option value="">All methods</option>
                {Object.entries(METHOD_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="pay-from" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">From</label>
              <input id="pay-from" type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => changeFilters({ from: e.target.value })} className={fieldClass} />
            </div>
            <div>
              <label htmlFor="pay-to" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">To</label>
              <input id="pay-to" type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => changeFilters({ to: e.target.value })} className={fieldClass} />
            </div>
          </div>
        )}
      />

      {payments !== null && (
        <section aria-label="Totals">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Total label="Collected" amount={summary.paid.amount} count={summary.paid.count} unit="paid payment" tone="text-green-700 dark:text-green-400" />
            <Total label="Pending" amount={summary.pending.amount} count={summary.pending.count} unit="pending payment" tone="text-amber-700 dark:text-amber-400" />
            {summary.refunded.count > 0 && (
              <Total label="Refunded" amount={summary.refunded.amount} count={summary.refunded.count} unit="refund" tone="text-gray-500 dark:text-gray-400" />
            )}
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Totals cover every payment matching your search and filters, not just this page.</p>
        </section>
      )}

      {payments === null ? (
        <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-8">Loading payments...</p>
      ) : (
        <DataTable tableId="payments"
          columns={[
            { key: 'invoiceNumber', label: 'Invoice' },
            { key: 'member', label: 'Member', render: (r) => (r.memberId?.name || memberName(r.memberId)) },
            { key: 'plan', label: 'Plan', render: (r) => (r.membershipPlanId?.name || planName(r.membershipPlanId) || '—'), hideOnMobile: true },
            { key: 'amount', label: 'Amount', render: (r) => fmtRupees(r.amount) },
            { key: 'method', label: 'Method', render: (r) => METHOD_LABEL[r.method] || r.method, hideOnMobile: true },
            {
              key: 'status',
              label: 'Status',
              render: (r) => (
                <span className={r.status === 'pending' ? 'text-amber-600 dark:text-amber-400' : r.status === 'refunded' ? 'text-gray-400' : ''}>
                  {STATUS_LABEL[r.status] || r.status}
                </span>
              ),
            },
            { key: 'paidAt', label: 'Paid At', render: (r) => (r.paidAt ? new Date(r.paidAt).toLocaleDateString() : '—'), hideOnMobile: true },
            {
              key: 'actions',
              label: 'Actions',
              render: (r) => (
                <div className="flex gap-2">
                  <button onClick={() => setReceiptFor(r)} className="text-blue-600 dark:text-blue-400 hover:underline">Receipt</button>
                  {r.status === 'pending' && (
                    <button onClick={() => handleMarkPaid(r)} className="text-green-700 dark:text-green-400 hover:underline whitespace-nowrap">Mark Paid</button>
                  )}
                  {r.status === 'paid' && canRefund && (
                    <button onClick={() => handleRefund(r)} className="text-red-600 dark:text-red-400 hover:underline">Refund</button>
                  )}
                </div>
              ),
            },
          ]}
          rows={payments}
        />
      )}

      {payments !== null && (
        <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
          <span>{total} payment{total === 1 ? '' : 's'} · page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className={`${toolBtn} disabled:opacity-40`}>Previous</button>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className={`${toolBtn} disabled:opacity-40`}>Next</button>
          </div>
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Record Payment">
        <form onSubmit={handleCreate} className="space-y-3">
          {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div>
            <label htmlFor="rp-member" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Member</label>
            <select id="rp-member" value={form.memberId} onChange={(e) => setForm({ ...form, memberId: e.target.value })} required className={fieldClass}>
              <option value="" disabled>Select member</option>
              {members.map((m) => <option key={m._id} value={m._id}>{m.name} ({m.memberCode})</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="rp-plan" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Plan</label>
            <select id="rp-plan" value={form.membershipPlanId} onChange={(e) => setForm({ ...form, membershipPlanId: e.target.value })} className={fieldClass}>
              <option value="">Use member's current plan</option>
              {plans.map((p) => <option key={p._id} value={p._id}>{p.name} ({fmtRupees(p.price)})</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="rp-amount" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Amount (₹)</label>
            <input id="rp-amount" type="number" min="0" step="any" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required className={fieldClass} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="rp-method" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Method</label>
              <select id="rp-method" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} className={fieldClass}>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                {canUseUpi && <option value="upi">UPI</option>}
                <option value="netbanking">Net banking</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label htmlFor="rp-status" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Status</label>
              <select id="rp-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={fieldClass}>
                <option value="paid">Paid</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving} className={primaryBtn}>{saving ? 'Saving...' : 'Record Payment'}</button>
            <button type="button" onClick={() => setShowAdd(false)} className={toolBtn}>Cancel</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!receiptFor} onClose={() => setReceiptFor(null)} title="Payment Receipt">
        {receiptFor && (
          <PaymentReceipt
            tenantName={tenantName}
            member={receiptFor.memberId || { name: memberName(receiptFor.memberId) }}
            planName={receiptFor.membershipPlanId?.name || planName(receiptFor.membershipPlanId)}
            amount={receiptFor.amount}
            method={receiptFor.method}
            invoiceNumber={receiptFor.invoiceNumber}
            paidAt={receiptFor.paidAt}
            status={receiptFor.status}
          />
        )}
      </Modal>
    </div>
  );
}
