import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useFeature } from '../../hooks/useFeature';
import { paymentsAPI, membersAPI, membershipPlansAPI, tenantSettingsAPI } from '../../services/api';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import PaymentReceipt from '../../components/PaymentReceipt';

const emptyForm = { memberId: '', membershipPlanId: '', amount: '', method: 'cash', status: 'paid' };
const inputClass = 'border rounded px-2 py-1 dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100';
const PAGE_SIZE = 20;

export default function Payments() {
  const { user } = useAuth();
  const canUseUpi = useFeature('features:upiPayments');
  const canRefund = useFeature('features:paymentRefunds');
  const [payments, setPayments] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [members, setMembers] = useState([]);
  const [plans, setPlans] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [filters, setFilters] = useState({ status: '', method: '', from: '', to: '' });
  const [tenantName, setTenantName] = useState('');
  const [receiptFor, setReceiptFor] = useState(null);

  const load = () => {
    const params = { page, limit: PAGE_SIZE };
    Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
    return paymentsAPI.list(params).then((res) => {
      setPayments(res.data.payments);
      setTotal(res.data.total);
    });
  };

  useEffect(() => {
    membersAPI.list({ limit: 500 }).then((res) => setMembers(res.data.members));
    membershipPlansAPI.list().then((res) => setPlans(res.data));
    tenantSettingsAPI.get().then((res) => setTenantName(res.data.name));
  }, []);
  useEffect(() => { load(); }, [page, filters]);
  // Any filter change invalidates the current page number.
  useEffect(() => { setPage(1); }, [filters]);

  const memberName = (id) => members.find((m) => m._id === id)?.name || id;
  const planName = (id) => plans.find((p) => p._id === id)?.name;

  const handleCreate = async (e) => {
    e.preventDefault();
    await paymentsAPI.create(form);
    setForm(emptyForm);
    load();
  };

  const handleMarkPaid = async (payment) => {
    await paymentsAPI.update(payment._id, { status: 'paid' });
    load();
  };

  const handleRefund = async (payment) => {
    if (!window.confirm(`Refund ₹${payment.amount} (${payment.invoiceNumber})? This reverses the collection and removes it from revenue.`)) return;
    await paymentsAPI.update(payment._id, { status: 'refunded' });
    load();
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const clearFilters = () => setFilters({ status: '', method: '', from: '', to: '' });
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Payments</h1>

      {user.role === 'branch-manager' && (
        <form onSubmit={handleCreate} className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Member</label>
            <select value={form.memberId} onChange={(e) => setForm({ ...form, memberId: e.target.value })} required className={inputClass}>
              <option value="" disabled>Select member</option>
              {members.map((m) => <option key={m._id} value={m._id}>{m.name} ({m.memberCode})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Plan</label>
            <select value={form.membershipPlanId} onChange={(e) => setForm({ ...form, membershipPlanId: e.target.value })} className={inputClass}>
              <option value="">Use member's current plan</option>
              {plans.map((p) => <option key={p._id} value={p._id}>{p.name} (₹{p.price})</option>)}
            </select>
          </div>
          <input placeholder="Amount" type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} required className={inputClass} />
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Method</label>
            <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} className={inputClass}>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              {canUseUpi && <option value="upi">UPI</option>}
              <option value="netbanking">Net banking</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Status</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputClass}>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          <button type="submit" className="bg-gray-900 text-white rounded px-4 py-2 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white">Record Payment</button>
        </form>
      )}

      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Status</label>
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} className={inputClass}>
            <option value="">All statuses</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
            <option value="refunded">Refunded</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Method</label>
          <select value={filters.method} onChange={(e) => setFilters({ ...filters, method: e.target.value })} className={inputClass}>
            <option value="">All methods</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="upi">UPI</option>
            <option value="netbanking">Net banking</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">From</label>
          <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">To</label>
          <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} className={inputClass} />
        </div>
        {hasFilters && (
          <button onClick={clearFilters} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">Clear filters</button>
        )}
      </div>

      <DataTable
        columns={[
          { key: 'invoiceNumber', label: 'Invoice' },
          { key: 'member', label: 'Member', render: (r) => (r.memberId?.name || memberName(r.memberId)) },
          { key: 'plan', label: 'Plan', render: (r) => (r.membershipPlanId?.name || planName(r.membershipPlanId) || '—'), hideOnMobile: true },
          { key: 'amount', label: 'Amount', render: (r) => `₹${r.amount}` },
          { key: 'method', label: 'Method', hideOnMobile: true },
          {
            key: 'status',
            label: 'Status',
            render: (r) => (
              <span className={r.status === 'pending' ? 'text-amber-600 dark:text-amber-400' : r.status === 'refunded' ? 'text-gray-400' : ''}>
                {r.status}
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
                  <button onClick={() => handleMarkPaid(r)} className="text-green-700 dark:text-green-400 hover:underline">Mark Paid</button>
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

      <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
        <span>{total} payment{total === 1 ? '' : 's'} · page {page} of {totalPages}</span>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="border rounded px-3 py-1 disabled:opacity-40 dark:border-gray-600 dark:text-gray-100"
          >
            Previous
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="border rounded px-3 py-1 disabled:opacity-40 dark:border-gray-600 dark:text-gray-100"
          >
            Next
          </button>
        </div>
      </div>

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
