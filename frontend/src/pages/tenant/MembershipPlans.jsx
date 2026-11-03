import { useEffect, useState } from 'react';
import { membershipPlansAPI, branchesAPI } from '../../services/api';
import DataTable from '../../components/DataTable';

const DURATION_OPTIONS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'half_yearly', label: 'Half-yearly' },
  { value: 'yearly', label: 'Yearly' },
];
const durationLabel = (unit) => DURATION_OPTIONS.find((o) => o.value === unit)?.label || unit;

const emptyForm = { name: '', durationUnit: 'monthly', price: '', description: '', branchId: '' };

const inputClass = 'border rounded px-2 py-1 dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100';

export default function MembershipPlans() {
  const [plans, setPlans] = useState([]);
  const [branches, setBranches] = useState([]);
  const [filterBranchId, setFilterBranchId] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);

  const load = () => membershipPlansAPI.list(filterBranchId || undefined).then((res) => setPlans(res.data));
  useEffect(() => { branchesAPI.list().then((res) => setBranches(res.data)); }, []);
  useEffect(() => { load(); }, [filterBranchId]);

  const branchName = (id) => branches.find((b) => b._id === id)?.name;

  const handleCreate = async (e) => {
    e.preventDefault();
    await membershipPlansAPI.create({ ...form, branchId: form.branchId || null });
    setForm(emptyForm);
    load();
  };

  const startEdit = (plan) => {
    setEditingId(plan._id);
    setEditForm({
      name: plan.name,
      durationUnit: plan.durationUnit,
      price: plan.price,
      description: plan.description || '',
      branchId: plan.branchId || '',
      isActive: plan.isActive,
    });
  };

  const cancelEdit = () => { setEditingId(null); setEditForm(emptyForm); };

  const handleUpdate = async (e) => {
    e.preventDefault();
    await membershipPlansAPI.update(editingId, { ...editForm, branchId: editForm.branchId || null });
    cancelEdit();
    load();
  };

  const handleRemove = async (plan) => {
    if (!window.confirm(`Deactivate plan "${plan.name}"?`)) return;
    await membershipPlansAPI.remove(plan._id);
    load();
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Membership Plans</h1>

      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-500 dark:text-gray-400">Show plans for</label>
        <select value={filterBranchId} onChange={(e) => setFilterBranchId(e.target.value)} className={inputClass}>
          <option value="">All branches</option>
          {branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
        </select>
      </div>

      <form onSubmit={handleCreate} className="bg-white dark:bg-gray-800 dark:border dark:border-gray-700 p-4 rounded-2xl shadow flex flex-wrap gap-3 items-end">
        <input placeholder="Plan name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className={inputClass} />
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Duration</label>
          <select value={form.durationUnit} onChange={(e) => setForm({ ...form, durationUnit: e.target.value })} className={inputClass}>
            {DURATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <input placeholder="Price" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} required className={inputClass} />
        <input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass} />
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Branch</label>
          <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} className={inputClass}>
            <option value="">Tenant-wide (all branches)</option>
            {branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
          </select>
        </div>
        <button type="submit" className="bg-gray-900 text-white rounded px-4 py-2 dark:bg-accent dark:text-accent-ink dark:font-semibold dark:hover:bg-accent-hover">Add Plan</button>
      </form>

      {editingId && (
        <form onSubmit={handleUpdate} className="bg-white dark:bg-gray-800 dark:border dark:border-gray-700 p-4 rounded-2xl shadow space-y-3 border-2 border-gray-900 dark:border-gray-100">
          <div className="text-sm text-gray-500 dark:text-gray-400">Editing plan</div>
          <div className="flex flex-wrap gap-3 items-end">
            <input placeholder="Plan name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required className={inputClass} />
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Duration</label>
              <select value={editForm.durationUnit} onChange={(e) => setEditForm({ ...editForm, durationUnit: e.target.value })} className={inputClass}>
                {DURATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <input placeholder="Price" type="number" value={editForm.price} onChange={(e) => setEditForm({ ...editForm, price: Number(e.target.value) })} required className={inputClass} />
            <input placeholder="Description" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} className={inputClass} />
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Branch</label>
              <select value={editForm.branchId} onChange={(e) => setEditForm({ ...editForm, branchId: e.target.value })} className={inputClass}>
                <option value="">Tenant-wide (all branches)</option>
                {branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <input type="checkbox" checked={editForm.isActive} onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })} />
              Active
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="bg-gray-900 text-white rounded px-4 py-2 dark:bg-accent dark:text-accent-ink dark:font-semibold dark:hover:bg-accent-hover">Save Changes</button>
            <button type="button" onClick={cancelEdit} className="border rounded px-4 py-2 dark:border-gray-600 dark:text-gray-100">Cancel</button>
          </div>
        </form>
      )}

      <DataTable tableId="membershipPlans"
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'durationUnit', label: 'Duration', render: (r) => durationLabel(r.durationUnit) },
          { key: 'price', label: 'Price', render: (r) => `₹${r.price}` },
          { key: 'branch', label: 'Branch', render: (r) => (r.branchId ? branchName(r.branchId) || 'Unknown branch' : 'All branches') },
          { key: 'isActive', label: 'Active', render: (r) => (r.isActive ? 'Yes' : 'No') },
          {
            key: 'actions',
            label: 'Actions',
            render: (row) => (
              <div className="flex gap-2">
                <button onClick={() => startEdit(row)} className="text-blue-600 dark:text-blue-400 hover:underline">Edit</button>
                <button
                  onClick={() => handleRemove(row)}
                  disabled={!row.isActive}
                  className="text-red-600 dark:text-red-400 hover:underline disabled:text-gray-300 dark:disabled:text-gray-600 disabled:no-underline disabled:cursor-not-allowed"
                >
                  {row.isActive ? 'Deactivate' : 'Inactive'}
                </button>
              </div>
            ),
          },
        ]}
        rows={plans}
      />
    </div>
  );
}
