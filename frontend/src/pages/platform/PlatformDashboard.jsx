import { useEffect, useState } from 'react';
import { dashboardAPI } from '../../services/api';
import PlatformDashboardView from '../dashboard/PlatformDashboardView';

export default function PlatformDashboard() {
  const [data, setData] = useState(null);
  useEffect(() => { dashboardAPI.platform().then((res) => setData(res.data)); }, []);
  if (!data) return <div className="p-6 text-gray-500 dark:text-gray-400">Loading...</div>;
  return <PlatformDashboardView data={data} />;
}
