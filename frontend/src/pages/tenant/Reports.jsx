import { useEffect, useState } from 'react';
import { reportsAPI, branchesAPI } from '../../services/api';
import StatCard from '../../components/StatCard';
import DataTable from '../../components/DataTable';
import BarChartCard from '../../components/BarChartCard';

const inputClass = 'border rounded px-2 py-1 dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100';
const STATUS_LABELS = { operational: 'Operational', under_maintenance: 'Under Maintenance', retired: 'Retired' };

export default function Reports() {
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState('');
  const [data, setData] = useState(null);

  useEffect(() => { branchesAPI.list().then((res) => setBranches(res.data)); }, []);
  useEffect(() => { reportsAPI.summary(branchId || undefined).then((res) => setData(res.data)); }, [branchId]);

  const branchName = (id) => branches.find((b) => b._id === id)?.name || '—';

  if (!data) return <div className="p-6 text-gray-500 dark:text-gray-400">Loading...</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Reports</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500 dark:text-gray-400">Branch</label>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={inputClass}>
            <option value="">All branches</option>
            {branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
          </select>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Membership — Plan Mix</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <BarChartCard title="Active members by plan" data={data.planMix} dataKey="activeMembers" xKey="planName" colorKey="violet" />
          <DataTable
            columns={[
              { key: 'planName', label: 'Plan' },
              { key: 'activeMembers', label: 'Active Members' },
              { key: 'monthlyValue', label: 'Value', render: (r) => `₹${r.monthlyValue}` },
            ]}
            rows={data.planMix}
            rowKey="planId"
          />
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Operational — Attendance (last 30 days)</h2>
        <BarChartCard title="Check-ins per day" data={data.attendanceTrend} dataKey="count" xKey="date" colorKey="blue" height={260} />
      </div>

      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Operational — Equipment Health</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          {data.equipmentByStatus.map((s) => (
            <StatCard key={s.status} label={STATUS_LABELS[s.status]} value={s.count} />
          ))}
        </div>
        <h3 className="text-sm text-gray-500 dark:text-gray-400 mb-2">Overdue maintenance</h3>
        <DataTable
          columns={[
            { key: 'name', label: 'Equipment' },
            { key: 'category', label: 'Category', render: (r) => r.category || '—' },
            ...(branchId ? [] : [{ key: 'branch', label: 'Branch', render: (r) => branchName(r.branchId) }]),
            { key: 'nextServiceDue', label: 'Due Since', render: (r) => new Date(r.nextServiceDue).toLocaleDateString() },
          ]}
          rows={data.equipmentOverdue}
        />
      </div>
    </div>
  );
}
