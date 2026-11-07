import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { membershipPlansAPI, branchesAPI } from '../../services/api';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import ListToolbar, { fieldClass, matches, primaryBtn, toolBtn } from '../../components/ListToolbar';
import { fmtRupees } from '../../utils/receipt';

const DURATION_OPTIONS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'half_yearly', label: 'Half-yearly' },
  { value: 'yearly', label: 'Yearly' },
];
const durationLabel = (unit) => DURATION_OPTIONS.find((o) => o.value === unit)?.label || unit;
const errorMessage = (err) => err?.response?.data?.message || err?.message || 'Something went wrong. Please try again.';

const emptyForm = { name: '', durationUnit: 'monthly', price: '', description: '', branchId: '', isActive: true };

export default function MembershipPlans() {
  const { user } = useAuth();
  // The API lets only the gym owner change plans; everyone else here reads them.
  const canManage = user.role === 'tenant-admin';
  const [plans, setPlans] = useState(null);
  const [branches, setBranches] = useState([]);
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState(null); // null = closed, 'new' = adding, else the plan being edited
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => membershipPlansAPI.list(branchFilter || undefined).then((res) => setPlans(res.data));
  useEffect(() => { if (canManage) branchesAPI.list().then((res) => setBranches(res.data)); }, [canManage]);
  useEffect(() => { load(); }, [branchFilter]);

  const branchName = (id) => branches.find((b) => b._id === id)?.name;

  const openAdd = () => { setForm(emptyForm); setError(''); setEditing('new'); };
  const openEdit = (plan) => {
    setError('');
    setForm({
      name: plan.name,
      durationUnit: plan.durationUnit,
      price: String(plan.price),
      description: plan.description || '',
      branchId: plan.branchId || '',
      isActive: plan.isActive,
    });
    setEditing(plan);
  };
  const close = () => setEditing(null);

  const handleSave = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const body = { ...form, price: Number(form.price), branchId: form.branchId || null };
      if (editing === 'new') await membershipPlansAPI.create(body);
      else await membershipPlansAPI.update(editing._id, body);
      close();
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (plan) => {
    if (!window.confirm(`Deactivate plan "${plan.name}"? Existing members keep it; new members can't be given it.`)) return;
    await membershipPlansAPI.remove(plan._id);
    load();
  };

  const rows = (plans || []).filter((p) => (showInactive || p.isActive) && matches(search, p.name, p.description));
  const chips = [
    branchFilter && { key: 'branch', text: branchName(branchFilter) || 'Branch', clear: () => setBranchFilter('') },
    showInactive && { key: 'inactive', text: 'Incl. inactive', clear: () => setShowInactive(false) },
  ].filter(Boolean);
  const clearAll = () => { setSearch(''); setBranchFilter(''); setShowInactive(false); };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <ListToolbar
        title="Membership Plans"
        count={plans ? rows.length : null}
        addLabel="Add Plan"
        onAdd={canManage ? openAdd : undefined}
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search plans"
        chips={chips}
        onClearAll={clearAll}
        filters={(
          <div className="space-y-3">
            {canManage && (
              <div>
                <label htmlFor="mp-branch" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Show plans for</label>
                <select id="mp-branch" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className={fieldClass}>
                  <option value="">All branches</option>
                  {branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
                </select>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              Show inactive plans
            </label>
          </div>
        )}
      />

      {!canManage && <p className="text-xs text-gray-500 dark:text-gray-400">Only the gym owner can add or change plans.</p>}

      {plans === null ? (
        <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-8">Loading plans...</p>
      ) : (
        <DataTable tableId="membershipPlans"
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'durationUnit', label: 'Duration', render: (r) => durationLabel(r.durationUnit) },
            { key: 'price', label: 'Price', render: (r) => fmtRupees(r.price) },
            ...(canManage ? [{ key: 'branch', label: 'Branch', render: (r) => (r.branchId ? branchName(r.branchId) || 'Unknown branch' : 'All branches') }] : []),
            { key: 'isActive', label: 'Active', render: (r) => (r.isActive ? 'Yes' : 'No') },
            ...(canManage ? [{
              key: 'actions',
              label: 'Actions',
              render: (row) => (
                <div className="flex gap-2">
                  <button onClick={() => openEdit(row)} className="text-blue-600 dark:text-blue-400 hover:underline">Edit</button>
                  <button
                    onClick={() => handleRemove(row)}
                    disabled={!row.isActive}
                    className="text-red-600 dark:text-red-400 hover:underline disabled:text-gray-300 dark:disabled:text-gray-600 disabled:no-underline disabled:cursor-not-allowed"
                  >
                    {row.isActive ? 'Deactivate' : 'Inactive'}
                  </button>
                </div>
              ),
            }] : []),
          ]}
          rows={rows}
        />
      )}

      <Modal open={editing !== null} onClose={close} title={editing === 'new' ? 'Add Plan' : 'Edit Plan'}>
        <form onSubmit={handleSave} className="space-y-3">
          {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div>
            <label htmlFor="mp-name" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Plan name</label>
            <input id="mp-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={60} className={fieldClass} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="mp-duration" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Duration</label>
              <select id="mp-duration" value={form.durationUnit} onChange={(e) => setForm({ ...form, durationUnit: e.target.value })} className={fieldClass}>
                {DURATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="mp-price" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Price (₹)</label>
              <input id="mp-price" type="number" min="0" step="any" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required className={fieldClass} />
            </div>
          </div>
          <div>
            <label htmlFor="mp-desc" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Description (optional)</label>
            <input id="mp-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={fieldClass} />
          </div>
          <div>
            <label htmlFor="mp-form-branch" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Branch</label>
            <select id="mp-form-branch" value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} className={fieldClass}>
              <option value="">All branches</option>
              {branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
            </select>
          </div>
          {editing !== 'new' && (
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              Active
            </label>
          )}
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving} className={primaryBtn}>{saving ? 'Saving...' : editing === 'new' ? 'Add Plan' : 'Save Changes'}</button>
            <button type="button" onClick={close} className={toolBtn}>Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
