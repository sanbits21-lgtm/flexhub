import { useEffect, useState } from 'react';
import { platformAdminsAPI, tenantsAPI } from '../../services/api';
import DataTable from '../../components/DataTable';

const inputClass = 'border rounded px-2 py-1 dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100';
const emptyForm = { name: '', email: '', phone: '', password: '' };
const emptyEditForm = { name: '', phone: '', isActive: true, managedTenantIds: [] };

export default function PlatformAdmins() {
  const [admins, setAdmins] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyEditForm);

  const load = () => platformAdminsAPI.list().then((res) => setAdmins(res.data));
  useEffect(() => {
    load();
    tenantsAPI.list().then((res) => setTenants(res.data));
  }, []);

  const tenantName = (id) => tenants.find((t) => t._id === id)?.name || id;
  const managedTenantsLabel = (admin) => {
    if (!admin.managedTenantIds || admin.managedTenantIds.length === 0) return 'All tenants (unscoped)';
    return admin.managedTenantIds.map(tenantName).join(', ');
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    await platformAdminsAPI.create(form);
    setForm(emptyForm);
    load();
  };

  const startEdit = (admin) => {
    setEditingId(admin._id);
    setEditForm({
      name: admin.name,
      phone: admin.phone,
      isActive: admin.isActive,
      managedTenantIds: admin.managedTenantIds || [],
    });
  };

  const cancelEdit = () => { setEditingId(null); setEditForm(emptyEditForm); };

  const toggleTenant = (tenantId) => {
    setEditForm((f) => ({
      ...f,
      managedTenantIds: f.managedTenantIds.includes(tenantId)
        ? f.managedTenantIds.filter((id) => id !== tenantId)
        : [...f.managedTenantIds, tenantId],
    }));
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    await platformAdminsAPI.update(editingId, editForm);
    cancelEdit();
    load();
  };

  const handleDeactivate = async (admin) => {
    if (!window.confirm(`Deactivate "${admin.name}"? They'll no longer be able to log in.`)) return;
    await platformAdminsAPI.remove(admin._id);
    load();
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Platform Admins</h1>

      <form onSubmit={handleCreate} className="bg-white dark:bg-gray-800 dark:border dark:border-gray-700 p-4 rounded-2xl shadow flex flex-wrap gap-3 items-end">
        {['name', 'email', 'phone', 'password'].map((field) => (
          <div key={field}>
            <label className="block text-xs text-gray-500 dark:text-gray-400 capitalize mb-1">{field}</label>
            <input
              type={field === 'password' ? 'password' : 'text'}
              value={form[field]}
              onChange={(e) => setForm({ ...form, [field]: e.target.value })}
              required
              className={inputClass}
            />
          </div>
        ))}
        <button type="submit" className="bg-gray-900 text-white rounded px-4 py-2 dark:bg-accent dark:text-accent-ink dark:font-semibold dark:hover:bg-accent-hover">Add Platform Admin</button>
      </form>

      {editingId && (
        <form onSubmit={handleUpdate} className="bg-white dark:bg-gray-800 dark:border dark:border-gray-700 p-4 rounded-2xl shadow space-y-3 border-2 border-gray-900 dark:border-gray-100">
          <div className="text-sm text-gray-500 dark:text-gray-400">Editing platform admin</div>
          <div className="flex flex-wrap gap-3 items-end">
            <input placeholder="Name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required className={inputClass} />
            <input placeholder="Phone" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} required className={inputClass} />
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <input type="checkbox" checked={editForm.isActive} onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })} />
              Active
            </label>
          </div>

          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              Managed tenants — leave all unchecked for unscoped access (sees every tenant)
            </label>
            <div className="border rounded dark:border-gray-600 max-h-48 overflow-y-auto p-2 space-y-1">
              {tenants.map((t) => (
                <label key={t._id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                  <input
                    type="checkbox"
                    checked={editForm.managedTenantIds.includes(t._id)}
                    onChange={() => toggleTenant(t._id)}
                  />
                  {t.name}
                </label>
              ))}
              {tenants.length === 0 && <p className="text-sm text-gray-400 dark:text-gray-500">No tenants yet.</p>}
            </div>
          </div>

          <div className="flex gap-2">
            <button type="submit" className="bg-gray-900 text-white rounded px-4 py-2 dark:bg-accent dark:text-accent-ink dark:font-semibold dark:hover:bg-accent-hover">Save Changes</button>
            <button type="button" onClick={cancelEdit} className="border rounded px-4 py-2 dark:border-gray-600 dark:text-gray-100">Cancel</button>
          </div>
        </form>
      )}

      <DataTable tableId="platformAdmins"
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'email', label: 'Email' },
          { key: 'phone', label: 'Phone' },
          { key: 'managedTenants', label: 'Managed Tenants', render: (r) => managedTenantsLabel(r) },
          { key: 'isActive', label: 'Active', render: (r) => (r.isActive ? 'Yes' : 'No') },
          {
            key: 'actions',
            label: 'Actions',
            render: (row) => (
              <div className="flex gap-2">
                <button onClick={() => startEdit(row)} className="text-blue-600 dark:text-blue-400 hover:underline">Edit</button>
                <button
                  onClick={() => handleDeactivate(row)}
                  disabled={!row.isActive}
                  className="text-red-600 dark:text-red-400 hover:underline disabled:text-gray-300 dark:disabled:text-gray-600 disabled:no-underline disabled:cursor-not-allowed"
                >
                  {row.isActive ? 'Deactivate' : 'Inactive'}
                </button>
              </div>
            ),
          },
        ]}
        rows={admins}
      />
    </div>
  );
}
