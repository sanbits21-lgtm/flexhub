import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { equipmentAPI, branchesAPI } from '../../services/api';
import DataTable from '../../components/DataTable';

const inputClass = 'border rounded px-2 py-1 dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100';
const emptyForm = { name: '', category: '', branchId: '' };

export default function Equipment() {
  const { user } = useAuth();
  const isTenantAdmin = user.role === 'tenant-admin';
  const [searchParams] = useSearchParams();
  const branchId = searchParams.get('branchId');
  const branchNameParam = searchParams.get('branchName');
  const [equipment, setEquipment] = useState([]);
  const [branches, setBranches] = useState([]);
  const [form, setForm] = useState(emptyForm);

  const load = () => equipmentAPI.list(branchId ? { branchId } : {}).then((res) => setEquipment(res.data));
  useEffect(() => {
    load();
    if (isTenantAdmin) branchesAPI.list().then((res) => setBranches(res.data));
  }, [branchId]);

  const branchName = (id) => branches.find((b) => b._id === id)?.name || '—';

  const handleCreate = async (e) => {
    e.preventDefault();
    await equipmentAPI.create(form);
    setForm(emptyForm);
    load();
  };

  const handleRetire = async (item) => {
    if (!window.confirm(`Retire "${item.name}"? This marks it out of service.`)) return;
    await equipmentAPI.remove(item._id);
    load();
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Equipment</h1>

      {branchId && (
        <div className="bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-sm px-4 py-2 rounded flex justify-between items-center">
          <span>Viewing equipment for <strong>{branchNameParam || 'selected branch'}</strong></span>
          <Link to="/equipment" className="underline">Clear filter</Link>
        </div>
      )}

      <form onSubmit={handleCreate} className="bg-white dark:bg-gray-800 dark:border dark:border-gray-700 p-4 rounded-2xl shadow flex flex-wrap gap-3 items-end">
        {isTenantAdmin && (
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Branch</label>
            <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} required className={inputClass}>
              <option value="" disabled>Select branch</option>
              {branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
            </select>
          </div>
        )}
        <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className={inputClass} />
        <input placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputClass} />
        <button type="submit" className="bg-gray-900 text-white rounded px-4 py-2 dark:bg-accent dark:text-accent-ink dark:font-semibold dark:hover:bg-accent-hover">Add Equipment</button>
      </form>

      <DataTable tableId="equipment"
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'category', label: 'Category', render: (r) => r.category || '—' },
          ...(isTenantAdmin && !branchId ? [{ key: 'branch', label: 'Branch', render: (r) => branchName(r.branchId) }] : []),
          { key: 'status', label: 'Status' },
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
        rows={equipment}
      />
    </div>
  );
}
