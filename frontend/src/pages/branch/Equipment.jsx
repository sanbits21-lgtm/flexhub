import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { equipmentAPI, branchesAPI } from '../../services/api';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import ListToolbar, { fieldClass, matches, primaryBtn, toolBtn } from '../../components/ListToolbar';

const emptyForm = { name: '', category: '', branchId: '' };
const STATUS_LABEL = { operational: 'Operational', under_maintenance: 'Under maintenance', retired: 'Retired' };
const errorMessage = (err) => err?.response?.data?.message || err?.message || 'Something went wrong. Please try again.';

export default function Equipment() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isTenantAdmin = user.role === 'tenant-admin';
  const [searchParams] = useSearchParams();
  const branchId = searchParams.get('branchId');
  const branchNameParam = searchParams.get('branchName');
  const [equipment, setEquipment] = useState(null);
  const [branches, setBranches] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => equipmentAPI.list(branchId ? { branchId } : {}).then((res) => setEquipment(res.data));
  useEffect(() => {
    load();
    if (isTenantAdmin) branchesAPI.list().then((res) => setBranches(res.data));
  }, [branchId]);

  const branchName = (id) => branches.find((b) => b._id === id)?.name || '—';

  const handleCreate = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await equipmentAPI.create(form);
      setForm(emptyForm);
      setShowAdd(false);
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleRetire = async (item) => {
    if (!window.confirm(`Retire "${item.name}"? This marks it out of service.`)) return;
    await equipmentAPI.remove(item._id);
    load();
  };

  const rows = (equipment || []).filter((r) => (!statusFilter || r.status === statusFilter) && matches(search, r.name, r.category));
  const chips = [
    branchId && { key: 'branch', text: branchNameParam || 'Selected branch', clear: () => navigate('/equipment') },
    statusFilter && { key: 'status', text: STATUS_LABEL[statusFilter], clear: () => setStatusFilter('') },
  ].filter(Boolean);
  const clearAll = () => { setSearch(''); setStatusFilter(''); if (branchId) navigate('/equipment'); };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <ListToolbar
        title="Equipment"
        count={equipment ? rows.length : null}
        addLabel="Add Equipment"
        onAdd={() => { setForm(emptyForm); setError(''); setShowAdd(true); }}
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search equipment"
        chips={chips}
        onClearAll={clearAll}
        filters={(
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1" htmlFor="eq-status">Status</label>
            <select id="eq-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={fieldClass}>
              <option value="">All statuses</option>
              {Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        )}
      />

      {equipment === null ? (
        <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-8">Loading equipment...</p>
      ) : (
        <DataTable tableId="equipment"
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'category', label: 'Category', render: (r) => r.category || '—' },
            ...(isTenantAdmin && !branchId ? [{ key: 'branch', label: 'Branch', render: (r) => branchName(r.branchId) }] : []),
            { key: 'status', label: 'Status', render: (r) => STATUS_LABEL[r.status] || r.status },
            {
              key: 'actions',
              label: 'Actions',
              render: (row) => (
                <button
                  onClick={() => handleRetire(row)}
                  disabled={row.status === 'retired'}
                  className="text-red-600 dark:text-red-400 hover:underline disabled:text-gray-300 dark:disabled:text-gray-600 disabled:no-underline disabled:cursor-not-allowed"
                >
                  {row.status === 'retired' ? 'Retired' : 'Retire'}
                </button>
              ),
            },
          ]}
          rows={rows}
        />
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Equipment">
        <form onSubmit={handleCreate} className="space-y-3">
          {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {isTenantAdmin && (
            <select aria-label="Branch" value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} required className={fieldClass}>
              <option value="" disabled>Select branch</option>
              {branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
            </select>
          )}
          <input placeholder="Name" aria-label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className={fieldClass} />
          <input placeholder="Category (optional)" aria-label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={fieldClass} />
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving} className={primaryBtn}>{saving ? 'Saving...' : 'Add Equipment'}</button>
            <button type="button" onClick={() => setShowAdd(false)} className={toolBtn}>Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
