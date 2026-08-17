import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { dashboardAPI, paymentsAPI } from '../services/api';
import StatCard from '../components/StatCard';
import DataTable from '../components/DataTable';
import BarChartCard from '../components/BarChartCard';
import RenewMembershipModal from '../components/RenewMembershipModal';

const daysUntil = (dateStr) => Math.ceil((new Date(dateStr) - new Date()) / (24 * 60 * 60 * 1000));
const expiresInLabel = (dateStr) => {
  const d = daysUntil(dateStr);
  return d <= 0 ? 'today' : `${d} day${d === 1 ? '' : 's'}`;
};
const expiredAgoLabel = (dateStr) => {
  const d = Math.abs(daysUntil(dateStr));
  return `${d} day${d === 1 ? '' : 's'} ago`;
};

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [branchSummary, setBranchSummary] = useState(null);
  const [payments, setPayments] = useState([]);
  const [branchDetailLoading, setBranchDetailLoading] = useState(false);
  const [renewingMember, setRenewingMember] = useState(null);

  const loadSummary = () => dashboardAPI.summary().then((res) => setData(res.data));
  useEffect(() => { loadSummary(); }, []);

  // A renewal moves the member out of the Expired/Expiring lists, so both the overall
  // summary and any drilled-into branch summary need re-fetching.
  const handleRenewed = () => {
    loadSummary();
    if (selectedBranchId) dashboardAPI.summary(selectedBranchId).then((res) => setBranchSummary(res.data));
  };

  const renewColumn = {
    key: 'renew',
    label: '',
    render: (r) => (
      <button onClick={() => setRenewingMember(r)} className="text-green-700 dark:text-green-400 hover:underline">Renew</button>
    ),
  };

  useEffect(() => {
    if (user.role !== 'tenant-admin') return;
    setBranchDetailLoading(true);
    Promise.all([
      selectedBranchId ? dashboardAPI.summary(selectedBranchId) : Promise.resolve(null),
      paymentsAPI.list(selectedBranchId ? { branchId: selectedBranchId, limit: 100 } : { limit: 100 }),
    ]).then(([sumRes, payRes]) => {
      setBranchSummary(sumRes ? sumRes.data : null);
      setPayments(payRes.data.payments);
    }).finally(() => setBranchDetailLoading(false));
  }, [selectedBranchId, user.role]);

  if (!data) return <div className="p-6 text-gray-500 dark:text-gray-400">Loading...</div>;

  const chartSource = branchSummary || data;
  const selectedBranchRow = data.perBranch?.find((b) => b.branchId === selectedBranchId);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Dashboard</h1>
        {user.role === 'tenant-admin' && (
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            <label className="text-sm text-gray-500 dark:text-gray-400">Filter by branch</label>
            <select value={selectedBranchId} onChange={(e) => setSelectedBranchId(e.target.value)} className="border rounded px-2 py-1 dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100">
              <option value="">All branches</option>
              {(data.perBranch || []).map((b) => <option key={b.branchId} value={b.branchId}>{b.branchName}</option>)}
            </select>
          </div>
        )}
      </div>

      {(user.role === 'super-admin' || user.role === 'platform-admin') && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Tenants" value={data.totalTenants} />
          <StatCard label="Active Tenants" value={data.activeTenants} />
          <StatCard label="MRR" value={`₹${data.mrr}`} />
        </div>
      )}

      {user.role === 'tenant-admin' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Active Members" value={chartSource.activeMembers} />
            <StatCard label="Revenue This Month" value={`₹${chartSource.revenueThisMonth}`} />
            {selectedBranchRow ? (
              <>
                <StatCard label="Equipment" value={selectedBranchRow.equipmentCount} />
                <StatCard label="Trainers" value={selectedBranchRow.trainerCount} />
              </>
            ) : (
              <StatCard label="Branches" value={data.branchCount ?? 0} />
            )}
            <StatCard label="Expiring Soon" value={chartSource.expiringSoonCount ?? 0} />
            <StatCard label="Expired" value={chartSource.expiredCount ?? 0} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <BarChartCard title="Members joining, monthly" data={chartSource.membersByMonth || []} dataKey="count" colorKey="blue" />
            <BarChartCard title="Collections, monthly" data={chartSource.collectionsByMonth || []} dataKey="amount" colorKey="aqua" valueFormatter={(v) => `₹${v}`} />
          </div>

          <div>
            <h3 className="text-md font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Collections {selectedBranchId ? '' : '(all branches)'}
            </h3>
            {branchDetailLoading ? (
              <div className="text-gray-500 dark:text-gray-400 text-sm">Loading...</div>
            ) : (
              <DataTable
                columns={[
                  { key: 'invoiceNumber', label: 'Invoice' },
                  { key: 'member', label: 'Member', render: (r) => r.memberId?.name || '—' },
                  { key: 'amount', label: 'Amount', render: (r) => `₹${r.amount}` },
                  { key: 'method', label: 'Method' },
                  { key: 'status', label: 'Status' },
                  { key: 'paidAt', label: 'Paid At', render: (r) => (r.paidAt ? new Date(r.paidAt).toLocaleDateString() : '—') },
                ]}
                rows={payments}
              />
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="text-md font-semibold text-gray-900 dark:text-gray-100 mb-2">Expiring Soon (next 7 days)</h3>
              <DataTable
                columns={[
                  { key: 'name', label: 'Name' },
                  { key: 'phone', label: 'Phone' },
                  { key: 'memberCode', label: 'Code' },
                  ...(selectedBranchRow ? [] : [{ key: 'branch', label: 'Branch', render: (r) => data.perBranch?.find((b) => b.branchId === r.branchId)?.branchName || '—' }]),
                  { key: 'expiresIn', label: 'Expires In', render: (r) => expiresInLabel(r.membershipEnd) },
                  renewColumn,
                ]}
                rows={chartSource.expiringSoonMembers || []}
              />
            </div>
            <div>
              <h3 className="text-md font-semibold text-gray-900 dark:text-gray-100 mb-2">Expired</h3>
              <DataTable
                columns={[
                  { key: 'name', label: 'Name' },
                  { key: 'phone', label: 'Phone' },
                  { key: 'memberCode', label: 'Code' },
                  ...(selectedBranchRow ? [] : [{ key: 'branch', label: 'Branch', render: (r) => data.perBranch?.find((b) => b.branchId === r.branchId)?.branchName || '—' }]),
                  { key: 'expiredAgo', label: 'Expired', render: (r) => expiredAgoLabel(r.membershipEnd) },
                  renewColumn,
                ]}
                rows={chartSource.expiredMembers || []}
              />
            </div>
          </div>
        </>
      )}

      {user.role === 'branch-manager' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Active Members" value={data.activeMembers} />
            <StatCard label="Today's Check-ins" value={data.todaysCheckins} />
            <StatCard label="Expiring Soon" value={data.expiringSoon} />
            <StatCard label="Expired" value={data.expiredCount ?? 0} />
            <StatCard label="Maintenance Due" value={data.maintenanceDue} />
            <StatCard label="Revenue This Month" value={`₹${data.revenueThisMonth}`} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="text-md font-semibold text-gray-900 dark:text-gray-100 mb-2">Expiring Soon (next 7 days)</h3>
              <DataTable
                columns={[
                  { key: 'name', label: 'Name' },
                  { key: 'phone', label: 'Phone' },
                  { key: 'memberCode', label: 'Code' },
                  { key: 'expiresIn', label: 'Expires In', render: (r) => expiresInLabel(r.membershipEnd) },
                  renewColumn,
                ]}
                rows={data.expiringSoonMembers || []}
              />
            </div>
            <div>
              <h3 className="text-md font-semibold text-gray-900 dark:text-gray-100 mb-2">Expired</h3>
              <DataTable
                columns={[
                  { key: 'name', label: 'Name' },
                  { key: 'phone', label: 'Phone' },
                  { key: 'memberCode', label: 'Code' },
                  { key: 'expiredAgo', label: 'Expired', render: (r) => expiredAgoLabel(r.membershipEnd) },
                  renewColumn,
                ]}
                rows={data.expiredMembers || []}
              />
            </div>
          </div>
        </>
      )}

      {user.role === 'trainer' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Assigned Members" value={data.assignedMemberCount} />
          <StatCard label="Low Attendance" value={data.lowAttendanceMemberIds?.length ?? 0} />
        </div>
      )}

      <RenewMembershipModal
        open={!!renewingMember}
        member={renewingMember}
        onClose={() => setRenewingMember(null)}
        onRenewed={handleRenewed}
      />
    </div>
  );
}
