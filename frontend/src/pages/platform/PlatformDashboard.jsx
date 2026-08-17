import { useEffect, useState } from 'react';
import { dashboardAPI } from '../../services/api';
import StatCard from '../../components/StatCard';

export default function PlatformDashboard() {
  const [data, setData] = useState(null);

  useEffect(() => { dashboardAPI.platform().then((res) => setData(res.data)); }, []);
  if (!data) return <div className="p-6 text-gray-500 dark:text-gray-400">Loading...</div>;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Platform Overview</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Tenants" value={data.totalTenants} />
        <StatCard label="Active Tenants" value={data.activeTenants} />
        <StatCard label="MRR" value={`₹${data.mrr}`} />
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <h2 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Tenants by Plan</h2>
        <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
          {data.tenantsByPlan.map((p) => (
            <li key={p._id}>{p._id}: {p.count}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
