import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { dashboardAPI } from '../services/api';
import TenantAdminDashboard from './dashboard/TenantAdminDashboard';
import BranchManagerDashboard from './dashboard/BranchManagerDashboard';
import TrainerDashboard from './dashboard/TrainerDashboard';
import PlatformDashboardView from './dashboard/PlatformDashboardView';

// One screen per role, each laid out to fit the viewport (see DashboardFrame). This file
// only owns the summary fetch and the role dispatch.
const BY_ROLE = {
  'super-admin': PlatformDashboardView,
  'platform-admin': PlatformDashboardView,
  'tenant-admin': TenantAdminDashboard,
  'branch-manager': BranchManagerDashboard,
  trainer: TrainerDashboard,
};

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);

  const load = () => dashboardAPI.summary().then((res) => setData(res.data));
  useEffect(() => { load(); }, []);

  if (!data) return <div className="p-6 text-gray-500 dark:text-gray-400">Loading...</div>;

  const View = BY_ROLE[user.role];
  if (!View) return <div className="p-6 text-gray-500 dark:text-gray-400">No dashboard for this role.</div>;
  return <View data={data} reload={load} />;
}
