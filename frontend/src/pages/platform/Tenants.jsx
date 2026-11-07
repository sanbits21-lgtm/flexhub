import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { tenantsAPI } from '../../services/api';
import DataTable from '../../components/DataTable';
import PendingApprovals from '../../components/PendingApprovals';

const emptyForm = {
  name: '', slug: '', contactEmail: '', contactPhone: '', billingPlan: 'trial', maxBranches: 1,
  admin: { name: '', email: '', phone: '', password: '' },
};

const emptyEditForm = {
  name: '', contactEmail: '', contactPhone: '', billingPlan: 'trial', billingStatus: 'active', maxBranches: 1, isActive: true,
};

const inputClass = 'border rounded px-2 py-1 dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100';

export default function Tenants() {
  const [tenants, setTenants] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyEditForm);

  const load = () => tenantsAPI.list().then((res) => setTenants(res.data));
  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    await tenantsAPI.create(form);
    setForm(emptyForm);
    load();
  };

  const startEdit = (tenant) => {
    setEditingId(tenant._id);
    setEditForm({
      name: tenant.name,
      contactEmail: tenant.contactEmail,
      contactPhone: tenant.contactPhone || '',
      billingPlan: tenant.billingPlan,
      billingStatus: tenant.billingStatus,
      maxBranches: tenant.maxBranches,
      isActive: tenant.isActive,
    });
  };

  const cancelEdit = () => { setEditingId(null); setEditForm(emptyEditForm); };

  const handleUpdate = async (e) => {
    e.preventDefault();
    await tenantsAPI.update(editingId, editForm);
    cancelEdit();
    load();
  };

  const extendTrial = async (tenant) => {
    const from = Math.max(Date.now(), tenant.trialEndsAt ? new Date(tenant.trialEndsAt).getTime() : 0);
    await tenantsAPI.update(tenant._id, { trialEndsAt: new Date(from + 7 * 86400000).toISOString() });
    load();
  };

  const handleSuspend = async (tenant) => {
    if (!window.confirm(`Suspend tenant "${tenant.name}"? This deactivates it and marks billing as suspended.`)) return;
    await tenantsAPI.suspend(tenant._id);
    load();
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Tenants</h1>

      <PendingApprovals tenants={tenants} onChanged={load} />

      <form onSubmit={handleCreate} className="bg-white dark:bg-gray-800 dark:border dark:border-gray-700 p-4 rounded-2xl shadow space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <input placeholder="Gym brand name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className={inputClass} />
          <input placeholder="Slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} required className={inputClass} />
          <input placeholder="Contact email" type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} required className={inputClass} />
          <input placeholder="Contact phone" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} className={inputClass} />
          <select value={form.billingPlan} onChange={(e) => setForm({ ...form, billingPlan: e.target.value })} className={inputClass}>
            <option value="trial">Trial</option>
            <option value="basic">Basic</option>
            <option value="pro">Pro</option>
            <option value="enterprise">Enterprise</option>
          </select>
          <input placeholder="Max branches" type="number" min="1" value={form.maxBranches} onChange={(e) => setForm({ ...form, maxBranches: Number(e.target.value) })} className={inputClass} />
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400 pt-2">First Tenant Admin</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <input placeholder="Name" value={form.admin.name} onChange={(e) => setForm({ ...form, admin: { ...form.admin, name: e.target.value } })} required className={inputClass} />
          <input placeholder="Email" type="email" value={form.admin.email} onChange={(e) => setForm({ ...form, admin: { ...form.admin, email: e.target.value } })} required className={inputClass} />
          <input placeholder="Phone" value={form.admin.phone} onChange={(e) => setForm({ ...form, admin: { ...form.admin, phone: e.target.value } })} required className={inputClass} />
          <input placeholder="Password" type="password" value={form.admin.password} onChange={(e) => setForm({ ...form, admin: { ...form.admin, password: e.target.value } })} required className={inputClass} />
        </div>
        <button type="submit" className="bg-gray-900 text-white rounded px-4 py-2 dark:bg-accent dark:text-accent-ink dark:font-semibold dark:hover:bg-accent-hover">Onboard Tenant</button>
      </form>

      {editingId && (
        <form onSubmit={handleUpdate} className="bg-white dark:bg-gray-800 dark:border dark:border-gray-700 p-4 rounded-2xl shadow space-y-3 border-2 border-gray-900 dark:border-gray-100">
          <div className="text-sm text-gray-500 dark:text-gray-400">Editing tenant</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <input placeholder="Gym brand name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required className={inputClass} />
            <input placeholder="Contact email" type="email" value={editForm.contactEmail} onChange={(e) => setEditForm({ ...editForm, contactEmail: e.target.value })} required className={inputClass} />
            <input placeholder="Contact phone" value={editForm.contactPhone} onChange={(e) => setEditForm({ ...editForm, contactPhone: e.target.value })} className={inputClass} />
            <select value={editForm.billingPlan} onChange={(e) => setEditForm({ ...editForm, billingPlan: e.target.value })} className={inputClass}>
              <option value="trial">Trial</option>
              <option value="basic">Basic</option>
              <option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option>
            </select>
            <select value={editForm.billingStatus} onChange={(e) => setEditForm({ ...editForm, billingStatus: e.target.value })} className={inputClass}>
              <option value="active">Active</option>
              <option value="past_due">Past due</option>
              <option value="suspended">Suspended</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <input placeholder="Max branches" type="number" min="1" value={editForm.maxBranches} onChange={(e) => setEditForm({ ...editForm, maxBranches: Number(e.target.value) })} className={inputClass} />
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

      <DataTable tableId="tenants"
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'slug', label: 'Slug' },
          { key: 'billingPlan', label: 'Plan', render: (row) => (row.packageName ? `${row.packageName} (${row.billingPlan})` : row.billingPlan) },
          { key: 'billingStatus', label: 'Status' },
          { key: 'maxBranches', label: 'Max Branches' },
          {
            key: 'trialEndsAt',
            label: 'Trial',
            render: (row) => {
              if (row.billingPlan !== 'trial' || !row.trialEndsAt) return row.billingPlan === 'trial' ? 'No end date' : '-';
              const ended = new Date(row.trialEndsAt) <= new Date();
              return <span className={ended ? 'text-red-600 dark:text-red-400' : ''}>{ended ? 'Ended ' : 'Ends '}{new Date(row.trialEndsAt).toLocaleDateString()}</span>;
            },
          },
          { key: 'signupSource', label: 'Source', render: (row) => (row.signupSource === 'self' ? 'Self sign-up' : 'Platform') },
          {
            key: 'actions',
            label: 'Actions',
            render: (row) => (
              <div className="flex gap-2">
                <Link to={`/tenants/${row._id}/workspace`} className="text-blue-600 dark:text-blue-400 hover:underline">Workspace</Link>
                {row.billingPlan === 'trial' && row.trialEndsAt && <button onClick={() => extendTrial(row)} className="text-blue-600 dark:text-blue-400 hover:underline">+7 days</button>}
                <button onClick={() => startEdit(row)} className="text-blue-600 dark:text-blue-400 hover:underline">Edit</button>
                <button
                  onClick={() => handleSuspend(row)}
                  disabled={row.billingStatus === 'suspended'}
                  className="text-red-600 dark:text-red-400 hover:underline disabled:text-gray-300 dark:disabled:text-gray-600 disabled:no-underline disabled:cursor-not-allowed"
                >
                  {row.billingStatus === 'suspended' ? 'Suspended' : 'Suspend'}
                </button>
              </div>
            ),
          },
        ]}
        rows={tenants.filter((t) => t.approvalStatus !== 'pending')}
      />
    </div>
  );
}
