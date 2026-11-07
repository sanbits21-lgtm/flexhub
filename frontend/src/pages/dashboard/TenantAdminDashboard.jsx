import { useEffect, useState } from 'react';
import { dashboardAPI, paymentsAPI } from '../../services/api';
import StatCard from '../../components/StatCard';
import Widget from '../../components/Widget';
import DataTable from '../../components/DataTable';
import BarChartCard from '../../components/BarChartCard';
import { DashboardFrame, useExpiryTiles, paymentColumns } from './shared';

export default function TenantAdminDashboard({ data, reload }) {
  const [branchId, setBranchId] = useState('');
  const [branchSummary, setBranchSummary] = useState(null);
  const [payments, setPayments] = useState([]);

  const loadDetail = () => Promise.all([
    branchId ? dashboardAPI.summary(branchId) : Promise.resolve(null),
    paymentsAPI.list(branchId ? { branchId, limit: 100 } : { limit: 100 }),
  ]).then(([sumRes, payRes]) => {
    setBranchSummary(sumRes ? sumRes.data : null);
    setPayments(payRes.data.payments);
  });
  useEffect(() => { loadDetail(); }, [branchId]);

  // A renewal moves the member out of the Expired/Expiring lists, so the overall summary
  // and any drilled-into branch summary both need re-fetching.
  const handleRenewed = () => { reload(); loadDetail(); };

  const view = branchSummary || data;
  const branchRow = data.perBranch?.find((b) => b.branchId === branchId);
  const branchName = (id) => data.perBranch?.find((b) => b.branchId === id)?.branchName || '—';
  const checkins = (view.attendanceTrend || []).map((d) => ({ day: d._id.slice(5), count: d.count }));

  const branchFilter = (
    <div className="flex items-center gap-2">
      <label className="text-sm text-gray-500 dark:text-gray-400">Branch</label>
      <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="border rounded px-2 py-1 text-sm dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100">
        <option value="">All branches</option>
        {(data.perBranch || []).map((b) => <option key={b.branchId} value={b.branchId}>{b.branchName}</option>)}
      </select>
    </div>
  );

  const stat = (id, label, value) => ({ id, title: label, node: <StatCard compact label={label} value={value} /> });
  const kpis = [
    stat('active', 'Active members', view.activeMembers),
    stat('revenue', 'Revenue this month', `₹${view.revenueThisMonth}`),
    ...(branchRow
      ? [stat('equipment', 'Equipment', branchRow.equipmentCount), stat('trainers', 'Trainers', branchRow.trainerCount)]
      : [stat('branches', 'Branches', data.branchCount ?? 0)]),
    stat('expiring', 'Expiring soon', view.expiringSoonCount ?? 0),
    stat('expired', 'Expired', view.expiredCount ?? 0),
  ];

  const { expiringNode, expiredNode, modal } = useExpiryTiles({
    expiring: view.expiringSoonMembers || [],
    expired: view.expiredMembers || [],
    branchNameFor: branchRow ? null : branchName,
    onRenewed: handleRenewed,
  });

  const tiles = [
    { id: 'members-chart', title: 'Members joining, monthly', span: 'lg:col-span-3', node: <BarChartCard fill title="Members joining, monthly" data={view.membersByMonth || []} dataKey="count" colorKey="blue" /> },
    { id: 'collections-chart', title: 'Collections, monthly', span: 'lg:col-span-3', node: <BarChartCard fill title="Collections, monthly" data={view.collectionsByMonth || []} dataKey="amount" colorKey="aqua" valueFormatter={(v) => `₹${v}`} /> },
    { id: 'checkins-chart', title: 'Check-ins, last 7 days', span: 'lg:col-span-3', node: <BarChartCard fill title="Check-ins, last 7 days" data={checkins} dataKey="count" xKey="day" colorKey="violet" /> },
    { id: 'branches', title: 'Branches', span: 'lg:col-span-3', node: (
      <Widget title="Branches">
        <DataTable
          tableId="dash.ta.branches"
          embedded
          rowKey="branchId"
          rows={data.perBranch || []}
          columns={[
            { key: 'branchName', label: 'Branch', render: (r) => (
              <button onClick={() => setBranchId(r.branchId)} className="hover:underline text-left">{r.branchName}</button>
            ) },
            { key: 'activeMembers', label: 'Active' },
            { key: 'trainerCount', label: 'Trainers' },
            { key: 'equipmentCount', label: 'Equip.' },
          ]}
        />
      </Widget>
    ) },
    { id: 'collections', title: 'Collections', span: 'lg:col-span-4', node: (
      <Widget title={`Collections ${branchId ? '' : '(all branches)'}`}>
        <DataTable tableId="dash.ta.collections" embedded rows={payments} columns={paymentColumns} />
      </Widget>
    ) },
    { id: 'expiring', title: 'Expiring soon', span: 'lg:col-span-4', node: expiringNode },
    { id: 'expired', title: 'Expired', span: 'lg:col-span-4', node: expiredNode },
  ];

  return (
    <>
      <DashboardFrame title="Dashboard" layoutId="tenant-admin" actions={branchFilter} kpis={kpis} tiles={tiles} />
      {modal}
    </>
  );
}