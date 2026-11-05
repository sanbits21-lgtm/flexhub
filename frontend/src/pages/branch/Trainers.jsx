import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { staffAPI, branchesAPI } from '../../services/api';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import ListToolbar, { fieldClass, matches, primaryBtn, toolBtn } from '../../components/ListToolbar';

const emptyForm = { name: '', email: '', phone: '', password: '', specialization: '', branchId: '' };
const emptyEditForm = { name: '', phone: '', specialization: '', isActive: true };
const errorMessage = (err) => err?.response?.data?.message || err?.message || 'Something went wrong. Please try again.';

export default function Trainers() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isTenantAdmin = user.role === 'tenant-admin';
  const [searchParams] = useSearchParams();
  const branchId = searchParams.get('branchId');
  const branchNameParam = searchParams.get('branchName');
  const [trainers, setTrainers] = useState(null);
  const [branches, setBranches] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(''); // '' | 'active' | 'inactive'
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyEditForm);
  const [reset, setReset] = useState(null); // { trainer, creds?, error? }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => staffAPI.list({ role: 'trainer', ...(branchId ? { branchId } : {}) }).then((res) => setTrainers(res.data));
  useEffect(() => {
    load();
    if (isTenantAdmin) branchesAPI.list().then((res) => setBranches(res.data));
  }, [branchId]);

  const branchName = (id) => branches.find((b) => b._id === id)?.name || '—';

  // One save path for both popups: a failure (duplicate email, weak password) stays visible
  // in the popup instead of vanishing.
  const save = (action, done) => async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await action();
      done();
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = save(() => staffAPI.createTrainer(form), () => { setForm(emptyForm); setShowAdd(false); });
  const handleUpdate = save(() => staffAPI.update(editingId, editForm), () => cancelEdit());

  const openAdd = () => { setForm(emptyForm); setError(''); setShowAdd(true); };
  const startEdit = (trainer) => {
    setError('');
    setEditingId(trainer._id);
    setEditForm({
      name: trainer.name,
      phone: trainer.phone,
      specialization: trainer.specialization || '',
      isActive: trainer.isActive,
    });
  };
  function cancelEdit() { setEditingId(null); setEditForm(emptyEditForm); }

  const handleDeactivate = async (trainer) => {
    if (!window.confirm(`Deactivate "${trainer.name}"? They'll no longer be able to log in.`)) return;
    await staffAPI.remove(trainer._id);
    load();
  };

  const rows = (trainers || []).filter((t) => (
    (!statusFilter || (statusFilter === 'active') === t.isActive) && matches(search, t.name, t.email, t.specialization)
  ));
  const chips = [
    branchId && { key: 'branch', text: branchNameParam || 'Selected branch', clear: () => navigate('/trainers') },
    statusFilter && { key: 'status', text: statusFilter === 'active' ? 'Active' : 'Inactive', clear: () => setStatusFilter('') },
  ].filter(Boolean);
  const clearAll = () => { setSearch(''); setStatusFilter(''); if (branchId) navigate('/trainers'); };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <ListToolbar
        title="Trainers"
        count={trainers ? rows.length : null}
        addLabel="Add Trainer"
        onAdd={openAdd}
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search trainers"
        chips={chips}
        onClearAll={clearAll}
        filters={(
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1" htmlFor="tr-status">Status</label>
            <select id="tr-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={fieldClass}>
              <option value="">All trainers</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        )}
      />

      {trainers === null ? (
        <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-8">Loading trainers...</p>
      ) : (
        <DataTable tableId="trainers"
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'email', label: 'Email' },
            ...(isTenantAdmin ? [{ key: 'branch', label: 'Branch', render: (r) => branchName(r.branchId), hideOnMobile: true }] : []),
            { key: 'specialization', label: 'Specialization', render: (r) => r.specialization || '—' },
            { key: 'isActive', label: 'Active', render: (r) => (r.isActive ? 'Yes' : 'No') },
            {
              key: 'actions',
              label: 'Actions',
              render: (row) => (
                <div className="flex gap-2">
                  <button onClick={() => startEdit(row)} className="text-blue-600 dark:text-blue-400 hover:underline">Edit</button>
                  <button onClick={() => setReset({ trainer: row })} disabled={!row.isActive} className="text-gray-600 dark:text-gray-300 hover:underline disabled:opacity-40 disabled:no-underline whitespace-nowrap">Reset password</button>
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
          rows={rows}
        />
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Trainer">
        <form onSubmit={handleCreate} className="space-y-3">
          {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {isTenantAdmin && (
            <select aria-label="Branch" value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} required className={fieldClass}>
              <option value="" disabled>Select branch</option>
              {branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
            </select>
          )}
          <input placeholder="Name" aria-label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className={fieldClass} />
          <input placeholder="Email" aria-label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required className={fieldClass} />
          <input placeholder="Phone" aria-label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required className={fieldClass} />
          <input placeholder="Password" aria-label="Password" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required className={fieldClass} />
          <input placeholder="Specialization (optional)" aria-label="Specialization" value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} className={fieldClass} />
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving} className={primaryBtn}>{saving ? 'Saving...' : 'Add Trainer'}</button>
            <button type="button" onClick={() => setShowAdd(false)} className={toolBtn}>Cancel</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!editingId} onClose={cancelEdit} title="Edit trainer">
        <form onSubmit={handleUpdate} className="space-y-3">
          {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <input placeholder="Name" aria-label="Name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required className={fieldClass} />
          <input placeholder="Phone" aria-label="Phone" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} required className={fieldClass} />
          <input placeholder="Specialization" aria-label="Specialization" value={editForm.specialization} onChange={(e) => setEditForm({ ...editForm, specialization: e.target.value })} className={fieldClass} />
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <input type="checkbox" checked={editForm.isActive} onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })} />
            Active
          </label>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving} className={primaryBtn}>{saving ? 'Saving...' : 'Save Changes'}</button>
            <button type="button" onClick={cancelEdit} className={toolBtn}>Cancel</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!reset} onClose={() => setReset(null)} title={`Reset password: ${reset?.trainer?.name || ''}`}>
        {reset && !reset.creds && (
          <div className="space-y-3 text-sm text-gray-700 dark:text-gray-200">
            <p>This creates a temporary password. Their current password stops working and they are signed out of the app and the website.</p>
            {reset.error && <p className="text-red-600 dark:text-red-400">{reset.error}</p>}
            <button
              onClick={async () => {
                try {
                  const res = await staffAPI.resetPassword(reset.trainer._id);
                  setReset({ trainer: reset.trainer, creds: res.data });
                } catch (err) {
                  setReset({ trainer: reset.trainer, error: err.response?.data?.message || 'Could not reset the password.' });
                }
              }}
              className={primaryBtn}
            >
              Create temporary password
            </button>
          </div>
        )}
        {reset?.creds && (
          <div className="space-y-3 text-sm text-gray-700 dark:text-gray-200">
            <p>Give these to the trainer. The password is shown once, and they can change it under Account in the app.</p>
            <dl className="grid grid-cols-[6rem_1fr] gap-y-1">
              <dt className="text-gray-500 dark:text-gray-400">Email</dt><dd className="font-mono break-all">{reset.creds.email}</dd>
              <dt className="text-gray-500 dark:text-gray-400">Password</dt><dd className="font-mono">{reset.creds.password}</dd>
            </dl>
            <button onClick={() => setReset(null)} className={toolBtn}>Done</button>
          </div>
        )}
      </Modal>
    </div>
  );
}
