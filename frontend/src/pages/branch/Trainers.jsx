import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { staffAPI, branchesAPI } from '../../services/api';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';

const inputClass = 'border rounded px-2 py-1 dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100';
const emptyForm = { name: '', email: '', phone: '', password: '', specialization: '', branchId: '' };
const emptyEditForm = { name: '', phone: '', specialization: '', isActive: true };

export default function Trainers() {
  const { user } = useAuth();
  const isTenantAdmin = user.role === 'tenant-admin';
  const [searchParams] = useSearchParams();
  const branchId = searchParams.get('branchId');
  const branchNameParam = searchParams.get('branchName');
  const [trainers, setTrainers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyEditForm);
  const [reset, setReset] = useState(null); // { trainer, creds?, error? }

  const load = () => staffAPI.list({ role: 'trainer', ...(branchId ? { branchId } : {}) }).then((res) => setTrainers(res.data));
  useEffect(() => {
    load();
    if (isTenantAdmin) branchesAPI.list().then((res) => setBranches(res.data));
  }, [branchId]);

  const branchName = (id) => branches.find((b) => b._id === id)?.name || '—';

  const handleCreate = async (e) => {
    e.preventDefault();
    await staffAPI.createTrainer(form);
    setForm(emptyForm);
    load();
  };

  const startEdit = (trainer) => {
    setEditingId(trainer._id);
    setEditForm({
      name: trainer.name,
      phone: trainer.phone,
      specialization: trainer.specialization || '',
      isActive: trainer.isActive,
    });
  };

  const cancelEdit = () => { setEditingId(null); setEditForm(emptyEditForm); };

  const handleUpdate = async (e) => {
    e.preventDefault();
    await staffAPI.update(editingId, editForm);
    cancelEdit();
    load();
  };

  const handleDeactivate = async (trainer) => {
    if (!window.confirm(`Deactivate "${trainer.name}"? They'll no longer be able to log in.`)) return;
    await staffAPI.remove(trainer._id);
    load();
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Trainers</h1>

      {branchId && (
        <div className="bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-sm px-4 py-2 rounded flex justify-between items-center">
          <span>Viewing trainers for <strong>{branchNameParam || 'selected branch'}</strong></span>
          <Link to="/trainers" className="underline">Clear filter</Link>
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
        <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required className={inputClass} />
        <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required className={inputClass} />
        <input placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required className={inputClass} />
        <input placeholder="Specialization" value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} className={inputClass} />
        <button type="submit" className="bg-gray-900 text-white rounded px-4 py-2 dark:bg-accent dark:text-accent-ink dark:font-semibold dark:hover:bg-accent-hover">Add Trainer</button>
      </form>

      {editingId && (
        <form onSubmit={handleUpdate} className="bg-white dark:bg-gray-800 dark:border dark:border-gray-700 p-4 rounded-2xl shadow space-y-3 border-2 border-gray-900 dark:border-gray-100">
          <div className="text-sm text-gray-500 dark:text-gray-400">Editing trainer</div>
          <div className="flex flex-wrap gap-3 items-end">
            <input placeholder="Name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required className={inputClass} />
            <input placeholder="Phone" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} required className={inputClass} />
            <input placeholder="Specialization" value={editForm.specialization} onChange={(e) => setEditForm({ ...editForm, specialization: e.target.value })} className={inputClass} />
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
                <button onClick={() => setReset({ trainer: row })} disabled={!row.isActive} className="text-gray-600 dark:text-gray-300 hover:underline disabled:opacity-40 disabled:no-underline">Reset password</button>
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
        rows={trainers}
      />

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
              className="bg-gray-900 text-white rounded px-4 py-2 dark:bg-accent dark:text-accent-ink dark:font-semibold"
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
            <button onClick={() => setReset(null)} className="border rounded px-4 py-2 dark:border-gray-600">Done</button>
          </div>
        )}
      </Modal>
    </div>
  );
}
