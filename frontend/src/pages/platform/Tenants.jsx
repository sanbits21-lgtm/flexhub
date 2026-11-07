import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { packagesAPI, tenantsAPI } from '../../services/api';
import { limitsLabel } from '../../utils/packages';
import DataTable from '../../components/DataTable';
import PendingApprovals from '../../components/PendingApprovals';

const emptyForm = {
  name: '', slug: '', contactEmail: '', contactPhone: '', billingPlan: 'trial', maxBranches: 1,
  admin: { name: '', email: '', phone: '', password: '' },
};

const emptyEditForm = {
  name: '', contactEmail: '', contactPhone: '', billingPlan: 'trial', billingStatus: 'active', maxBranches: 1, isActive: true,
};

// yyyy-mm-dd in the browser's own time zone, for a date input.
const dayOf = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const when = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const inputClass = 'border rounded px-2 py-1 dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100';

export default function Tenants() {
  const [tenants, setTenants] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyEditForm);

  const [packages, setPackages] = useState([]);
  const [heldPackage, setHeldPackage] = useState(''); // what the gym had when editing began
  const [heldPlanEnd, setHeldPlanEnd] = useState('');
  const [editError, setEditError] = useState('');
  const [renewing, setRenewing] = useState(null); // { tenant, months, amount }
  const [renewError, setRenewError] = useState('');

  const load = () => tenantsAPI.list().then((res) => setTenants(res.data));
  useEffect(() => { load(); packagesAPI.list().then((r) => setPackages(r.data)).catch(() => {}); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    await tenantsAPI.create(form);
    setForm(emptyForm);
    load();
  };

  const startEdit = (tenant) => {
    setEditingId(tenant._id);
    setHeldPackage(tenant.packageId || '');
    setHeldPlanEnd(dayOf(tenant.planEndsAt));
    setEditError('');
    setEditForm({
      packageId: tenant.packageId || '',
      planEndsAt: dayOf(tenant.planEndsAt),
      name: tenant.name,
      contactEmail: tenant.contactEmail,
      contactPhone: tenant.contactPhone || '',
      billingPlan: tenant.billingPlan,
      billingStatus: tenant.billingStatus,
      maxBranches: tenant.maxBranches,
      isActive: tenant.isActive,
    });
  };

  const cancelEdit = () => { setEditingId(null); setEditForm(emptyEditForm); setEditError(''); };

  const handleUpdate = async (e) => {
    e.preventDefault();
    // Only a changed package is sent: it overrides the plan and limits typed beside it.
    const { packageId, planEndsAt, ...rest } = editForm;
    const payload = { ...rest };
    if (packageId && packageId !== heldPackage) payload.packageId = packageId;
    // Only a changed date is sent, so an unrelated edit does not move the end to midnight.
    if (planEndsAt !== heldPlanEnd) payload.planEndsAt = planEndsAt ? new Date(`${planEndsAt}T23:59:59`).toISOString() : '';
    try {
      await tenantsAPI.update(editingId, payload);
      cancelEdit();
      load();
    } catch (err) {
      setEditError(err.response?.data?.message || 'Could not save the changes.');
    }
  };

  const startRenew = (tenant) => {
    const pkg = packages.find((p) => p._id === tenant.packageId);
    setRenewError('');
    setRenewing({ tenant, months: pkg?.billingMonths || 1, amount: pkg?.price ?? 0 });
  };
  const doRenew = async (e) => {
    e.preventDefault();
    try {
      await tenantsAPI.renew(renewing.tenant._id, { months: Number(renewing.months), amount: Number(renewing.amount) });
      setRenewing(null);
      load();
    } catch (err) {
      setRenewError(err.response?.data?.message || 'Could not record the renewal.');
    }
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
            {packages.length > 0 && (
              <select aria-label="Package" value={editForm.packageId} onChange={(e) => setEditForm({ ...editForm, packageId: e.target.value })} className={inputClass}>
                <option value="">{heldPackage ? 'Package: (unchanged)' : 'Package: none'}</option>
                {packages.map((p) => <option key={p._id} value={p._id}>{p.name} · {limitsLabel(p)}</option>)}
              </select>
            )}
            <select value={editForm.billingStatus} onChange={(e) => setEditForm({ ...editForm, billingStatus: e.target.value })} className={inputClass}>
              <option value="active">Active</option>
              <option value="past_due">Past due</option>
              <option value="suspended">Suspended</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <input placeholder="Max branches" type="number" min="1" value={editForm.maxBranches} onChange={(e) => setEditForm({ ...editForm, maxBranches: Number(e.target.value) })} className={inputClass} />
            {editForm.billingPlan !== 'trial' && (
              <label className="text-sm text-gray-600 dark:text-gray-400">Plan ends
                <input type="date" value={editForm.planEndsAt || ''} onChange={(e) => setEditForm({ ...editForm, planEndsAt: e.target.value })} className={`${inputClass} block w-full`} />
              </label>
            )}
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <input type="checkbox" checked={editForm.isActive} onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })} />
              Active
            </label>
          </div>
          {editError && <div role="alert" className="text-sm text-red-700 dark:text-red-400">{editError}</div>}
          <div className="flex gap-2">
            <button type="submit" className="bg-gray-900 text-white rounded px-4 py-2 dark:bg-accent dark:text-accent-ink dark:font-semibold dark:hover:bg-accent-hover">Save Changes</button>
            <button type="button" onClick={cancelEdit} className="border rounded px-4 py-2 dark:border-gray-600 dark:text-gray-100">Cancel</button>
          </div>
        </form>
      )}

      {renewing && (
        <form onSubmit={doRenew} className="bg-white dark:bg-gray-800 dark:border dark:border-gray-700 p-4 rounded-2xl shadow space-y-3 border-2 border-gray-900 dark:border-gray-100">
          <div className="font-semibold text-gray-900 dark:text-gray-100">{renewing.tenant.billingPlan === 'trial' ? 'Activate a paid plan for' : 'Renew'} {renewing.tenant.name}</div>
          <p className="text-sm text-gray-600 dark:text-gray-300">Record a payment you have received. {renewing.tenant.billingPlan !== 'trial' && renewing.tenant.planEndsAt && new Date(renewing.tenant.planEndsAt) > new Date() ? `It is added after the current end (${when(renewing.tenant.planEndsAt)}).` : 'It runs from today.'}</p>
          <div className="flex flex-wrap items-end gap-3 text-sm text-gray-700 dark:text-gray-200">
            <label>Months<input type="number" min="1" max="60" required value={renewing.months} onChange={(e) => setRenewing({ ...renewing, months: e.target.value })} className={`${inputClass} block w-24`} /></label>
            <label>Amount received (₹)<input type="number" min="0" required value={renewing.amount} onChange={(e) => setRenewing({ ...renewing, amount: e.target.value })} className={`${inputClass} block w-36`} /></label>
            <button type="submit" className="bg-gray-900 text-white rounded px-4 py-2 dark:bg-accent dark:text-accent-ink dark:font-semibold">Record and renew</button>
            <button type="button" onClick={() => setRenewing(null)} className="border rounded px-4 py-2 dark:border-gray-600 dark:text-gray-100">Cancel</button>
          </div>
          {renewError && <div role="alert" className="text-sm text-red-700 dark:text-red-400">{renewError}</div>}
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
            label: 'Ends',
            render: (row) => {
              const end = row.billingPlan === 'trial' ? row.trialEndsAt : row.planEndsAt;
              if (!end) return 'No end date';
              const left = Math.ceil((new Date(end) - Date.now()) / 86400000);
              const cls = left <= 0 ? 'text-red-600 dark:text-red-400' : left <= 7 ? 'text-amber-600 dark:text-amber-400' : '';
              return <span className={cls}>{left <= 0 ? 'Ended ' : 'Ends '}{when(end)}{row.billingPlan === 'trial' ? ' (trial)' : ''}</span>;
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
                <button onClick={() => startRenew(row)} className="text-blue-600 dark:text-blue-400 hover:underline">{row.billingPlan === 'trial' ? 'Activate plan' : 'Renew'}</button>
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
