import { useEffect, useState } from 'react';
import { staffAPI } from '../../services/api';
import DataTable from '../../components/DataTable';

export default function TrainerReport() {
  const [trainers, setTrainers] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');

  const load = () => staffAPI.trainerReport().then((res) => {
    setTrainers(res.data);
    const nextDrafts = {};
    res.data.forEach((t) => { nextDrafts[t._id] = t.salary ?? ''; });
    setDrafts(nextDrafts);
  });
  useEffect(() => { load(); }, []);

  const totalCollections = trainers.reduce((sum, t) => sum + t.collections, 0);
  const totalSalary = trainers.reduce((sum, t) => sum + (Number(t.salary) || 0), 0);

  const handleSaveSalary = async (trainer) => {
    setSavingId(trainer._id);
    setError('');
    try {
      await staffAPI.update(trainer._id, {
        name: trainer.name,
        salary: drafts[trainer._id] === '' ? null : Number(drafts[trainer._id]),
      });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save the salary.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Trainer Collections & Salary</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 dark:border dark:border-gray-700 rounded-2xl shadow p-4">
          <div className="text-sm text-gray-500 dark:text-gray-400">Total Collections (all-time, assigned members)</div>
          <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100">₹{totalCollections}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 dark:border dark:border-gray-700 rounded-2xl shadow p-4">
          <div className="text-sm text-gray-500 dark:text-gray-400">Total Monthly Salary</div>
          <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100">₹{totalSalary}</div>
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <DataTable tableId="trainerReport"
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'branchName', label: 'Branch', render: (r) => r.branchName || '—' },
          { key: 'specialization', label: 'Specialization', render: (r) => r.specialization || '—' },
          { key: 'assignedMemberCount', label: 'Assigned Members' },
          { key: 'collections', label: 'Collections', render: (r) => `₹${r.collections}` },
          {
            key: 'salary',
            label: 'Salary',
            render: (r) => (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  value={drafts[r._id] ?? ''}
                  onChange={(e) => setDrafts({ ...drafts, [r._id]: e.target.value })}
                  className="border rounded px-2 py-1 w-28 dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100"
                  placeholder="Not set"
                />
                <button
                  onClick={() => handleSaveSalary(r)}
                  disabled={savingId === r._id}
                  className="text-blue-600 dark:text-blue-400 hover:underline disabled:text-gray-300 dark:disabled:text-gray-600"
                >
                  {savingId === r._id ? 'Saving...' : 'Save'}
                </button>
              </div>
            ),
          },
        ]}
        rows={trainers}
      />
    </div>
  );
}
