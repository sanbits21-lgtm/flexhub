import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { branchesAPI, dashboardAPI } from '../../services/api';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import ListToolbar, { fieldClass, matches, primaryBtn, toolBtn } from '../../components/ListToolbar';

const emptyForm = { name: '', phone: '', timezone: 'Asia/Kolkata', capacity: '' };
const emptyManagerForm = { name: '', email: '', phone: '', password: '' };
const errorMessage = (err) => err?.response?.data?.message || err?.message || 'Something went wrong. Please try again.';

export default function Branches() {
  const [branches, setBranches] = useState(null);
  const [metrics, setMetrics] = useState({});
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [managerFor, setManagerFor] = useState(null); // the branch a manager is being added to
  const [managerForm, setManagerForm] = useState(emptyManagerForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    branchesAPI.list().then((res) => setBranches(res.data));
    dashboardAPI.summary().then((res) => {
      const byBranch = {};
      (res.data.perBranch || []).forEach((b) => { byBranch[b.branchId] = b; });
      setMetrics(byBranch);
    });
  };
  useEffect(() => { load(); }, []);

  const submit = (action, done) => async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await action();
      done();
      load();
    } catch (err) {
      // Swallowing this left the popup open with no explanation (duplicate email, weak password).
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = submit(() => branchesAPI.create(form), () => { setForm(emptyForm); setShowAdd(false); });
  const handleCreateManager = submit(() => branchesAPI.createManager(managerFor._id, managerForm), () => { setManagerForm(emptyManagerForm); setManagerFor(null); });

  const openAdd = () => { setForm(emptyForm); setError(''); setShowAdd(true); };
  const openManager = (branch) => { setManagerForm(emptyManagerForm); setError(''); setManagerFor(branch); };

  const rows = (branches || []).filter((b) => matches(search, b.name, b.phone));

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <ListToolbar
        title="Branches"
        count={branches ? rows.length : null}
        addLabel="Add Branch"
        onAdd={openAdd}
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search branches"
        onClearAll={() => setSearch('')}
      />

      {branches === null ? (
        <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-8">Loading branches...</p>
      ) : (
        <DataTable tableId="branches"
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'phone', label: 'Phone', render: (r) => r.phone || '—' },
            { key: 'capacity', label: 'Capacity', render: (r) => r.capacity ?? '—', hideOnMobile: true },
            { key: 'activeMembers', label: 'Active Members', render: (r) => metrics[r._id]?.activeMembers ?? '—' },
            { key: 'totalMembers', label: 'Total Members', render: (r) => metrics[r._id]?.totalMembers ?? '—' },
            { key: 'equipmentCount', label: 'Equipment', render: (r) => metrics[r._id]?.equipmentCount ?? '—' },
            { key: 'trainerCount', label: 'Trainers', render: (r) => metrics[r._id]?.trainerCount ?? '—' },
            {
              key: 'view', label: 'View', render: (r) => {
                const q = `branchId=${r._id}&branchName=${encodeURIComponent(r.name)}`;
                return (
                  <div className="flex gap-3">
                    <Link to={`/members?${q}`} className="text-blue-600 dark:text-blue-400 hover:underline">Members</Link>
                    <Link to={`/equipment?${q}`} className="text-blue-600 dark:text-blue-400 hover:underline">Equipment</Link>
                    <Link to={`/trainers?${q}`} className="text-blue-600 dark:text-blue-400 hover:underline">Trainers</Link>
                  </div>
                );
              },
            },
            {
              key: 'actions', label: 'Actions', render: (r) => (
                <button onClick={() => openManager(r)} className="text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap">
                  + Add Manager
                </button>
              ),
            },
          ]}
          rows={rows}
        />
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Branch">
        <form onSubmit={handleCreate} className="space-y-3">
          {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <input placeholder="Branch name" aria-label="Branch name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className={fieldClass} />
          <input placeholder="Phone" aria-label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={fieldClass} />
          <input placeholder="Capacity (optional)" aria-label="Capacity" type="number" min="1" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} className={fieldClass} />
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving} className={primaryBtn}>{saving ? 'Saving...' : 'Add Branch'}</button>
            <button type="button" onClick={() => setShowAdd(false)} className={toolBtn}>Cancel</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!managerFor} onClose={() => setManagerFor(null)} title={`New manager: ${managerFor?.name || ''}`}>
        <form onSubmit={handleCreateManager} className="space-y-3">
          {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <input placeholder="Name" aria-label="Name" value={managerForm.name} onChange={(e) => setManagerForm({ ...managerForm, name: e.target.value })} required className={fieldClass} />
          <input placeholder="Email" aria-label="Email" type="email" value={managerForm.email} onChange={(e) => setManagerForm({ ...managerForm, email: e.target.value })} required className={fieldClass} />
          <input placeholder="Phone" aria-label="Phone" value={managerForm.phone} onChange={(e) => setManagerForm({ ...managerForm, phone: e.target.value })} required className={fieldClass} />
          <input placeholder="Password" aria-label="Password" type="password" autoComplete="new-password" value={managerForm.password} onChange={(e) => setManagerForm({ ...managerForm, password: e.target.value })} required className={fieldClass} />
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving} className={primaryBtn}>{saving ? 'Creating...' : 'Create'}</button>
            <button type="button" onClick={() => setManagerFor(null)} className={toolBtn}>Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
