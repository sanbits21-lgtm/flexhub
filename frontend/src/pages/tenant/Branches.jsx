import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { branchesAPI, dashboardAPI } from '../../services/api';
import DataTable from '../../components/DataTable';

const emptyForm = { name: '', phone: '', timezone: 'Asia/Kolkata', capacity: '' };
const emptyManagerForm = { name: '', email: '', phone: '', password: '' };

export default function Branches() {
  const [branches, setBranches] = useState([]);
  const [metrics, setMetrics] = useState({});
  const [form, setForm] = useState(emptyForm);
  const [managerFormFor, setManagerFormFor] = useState(null);
  const [managerForm, setManagerForm] = useState(emptyManagerForm);

  const load = () => {
    branchesAPI.list().then((res) => setBranches(res.data));
    dashboardAPI.summary().then((res) => {
      const byBranch = {};
      (res.data.perBranch || []).forEach((b) => { byBranch[b.branchId] = b; });
      setMetrics(byBranch);
    });
  };
  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    await branchesAPI.create(form);
    setForm(emptyForm);
    load();
  };

  const handleCreateManager = async (e, branchId) => {
    e.preventDefault();
    await branchesAPI.createManager(branchId, managerForm);
    setManagerForm(emptyManagerForm);
    setManagerFormFor(null);
    load();
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Branches</h1>

      <form onSubmit={handleCreate} className="bg-white dark:bg-gray-800 dark:border dark:border-gray-700 p-4 rounded-2xl shadow flex flex-wrap gap-3 items-end">
        <input placeholder="Branch name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="border rounded px-2 py-1 dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100" />
        <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="border rounded px-2 py-1 dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100" />
        <input placeholder="Capacity" type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} className="border rounded px-2 py-1 dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100" />
        <button type="submit" className="bg-gray-900 text-white rounded px-4 py-2 dark:bg-accent dark:text-accent-ink dark:font-semibold dark:hover:bg-accent-hover">Add Branch</button>
      </form>

      <DataTable tableId="branches"
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'phone', label: 'Phone' },
          { key: 'capacity', label: 'Capacity' },
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
              <button onClick={() => setManagerFormFor(r._id)} className="text-blue-600 dark:text-blue-400 hover:underline">
                + Add Manager
              </button>
            ),
          },
        ]}
        rows={branches}
      />

      {managerFormFor && (
        <form onSubmit={(e) => handleCreateManager(e, managerFormFor)} className="bg-white dark:bg-gray-800 dark:border dark:border-gray-700 p-4 rounded-2xl shadow flex flex-wrap gap-3 items-end">
          <div className="text-sm text-gray-500 dark:text-gray-400 w-full">New Branch Manager</div>
          {['name', 'email', 'phone', 'password'].map((field) => (
            <input
              key={field}
              placeholder={field}
              type={field === 'password' ? 'password' : 'text'}
              value={managerForm[field]}
              onChange={(e) => setManagerForm({ ...managerForm, [field]: e.target.value })}
              required
              className="border rounded px-2 py-1 dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100"
            />
          ))}
          <button type="submit" className="bg-gray-900 text-white rounded px-4 py-2 dark:bg-accent dark:text-accent-ink dark:font-semibold dark:hover:bg-accent-hover">Create</button>
          <button type="button" onClick={() => setManagerFormFor(null)} className="text-gray-500 dark:text-gray-400">Cancel</button>
        </form>
      )}
    </div>
  );
}
