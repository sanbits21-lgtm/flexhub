import { useEffect, useState } from 'react';
import { BarChart3, Building2, CreditCard, Dumbbell, IndianRupee, QrCode, TrendingUp, UserPlus, Users, Activity } from 'lucide-react';
import { dashboardAPI, paymentsAPI } from '../../services/api';
import StatCard from '../../components/StatCard';
import Widget from '../../components/Widget';
import DataTable from '../../components/DataTable';
import BarChartCard from '../../components/BarChartCard';
import { MembershipDonut, QuickActions, RevenueCard } from '../../components/DashboardCards';
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

  const joins = (view.membersByMonth || []).map((d) => d.count);
  const collected = (view.collectionsByMonth || []).map((d) => d.amount);
  const totalMembers = branchRow ? branchRow.totalMembers : (data.perBranch || []).reduce((s, b) => s + (b.totalMembers || 0), 0);

  const branchFilter = (
    <div className="flex items-center gap-2">
      <label className="text-sm text-gray-500 dark:text-gray-400">Branch</label>
      <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="rounded-xl border px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
        <option value="">All branches</option>
        {(data.perBranch || []).map((b) => <option key={b.branchId} value={b.branchId}>{b.branchName}</option>)}
      </select>
    </div>
  );

  const kpi = (id, title, node) => ({ id, title, node });
  const kpis = [
    kpi('total', 'Total members', <StatCard icon={Users} tone="lime" label="Total members" value={totalMembers.toLocaleString('en-IN')} series={joins} />),
    kpi('new', 'New members this month', <StatCard icon={UserPlus} tone="blue" label="New members this month" value={(joins[joins.length - 1] ?? 0).toLocaleString('en-IN')} series={joins} />),
    kpi('revenue', 'Revenue this month', <StatCard icon={IndianRupee} tone="violet" label="Revenue this month" value={`₹${Number(view.revenueThisMonth || 0).toLocaleString('en-IN')}`} series={collected} />),
    branchRow
      ? kpi('equipment', 'Equipment', <StatCard icon={Dumbbell} tone="amber" label="Equipment" value={branchRow.equipmentCount} hint={`${branchRow.trainerCount} trainer${branchRow.trainerCount === 1 ? '' : 's'}`} />)
      : kpi('branches', 'Active branches', <StatCard icon={Building2} tone="lime" label="Active branches" value={data.branchCount ?? 0} />),
  ];

  const { expiringNode, expiredNode, modal } = useExpiryTiles({
    expiring: view.expiringSoonMembers || [],
    expired: view.expiredMembers || [],
    branchNameFor: branchRow ? null : branchName,
    onRenewed: handleRenewed,
  });

  const tiles = [
    { id: 'collections-chart', title: 'Revenue overview', span: 'lg:col-span-6', node: <RevenueCard icon={TrendingUp} data={view.collectionsByMonth || []} /> },
    { id: 'membership', title: 'Membership', span: 'lg:col-span-3', node: <MembershipDonut active={view.activeMembers || 0} total={totalMembers} /> },
    { id: 'quick', title: 'Quick actions', span: 'lg:col-span-3', node: (
      <QuickActions actions={[
        { label: 'Add Member', to: '/members?add=1', icon: UserPlus },
        { label: 'Record Payment', to: '/payments', icon: CreditCard },
        { label: 'View Reports', to: '/reports', icon: BarChart3 },
        { label: 'Member App QR', to: '/member-app-qr', icon: QrCode },
      ]} />
    ) },
    { id: 'members-chart', title: 'Members joining, monthly', span: 'lg:col-span-4', node: <BarChartCard fill title="Members joining, monthly" data={view.membersByMonth || []} dataKey="count" colorKey="blue" /> },
    { id: 'checkins-chart', title: 'Check-ins, last 7 days', span: 'lg:col-span-4', node: <BarChartCard fill title="Check-ins, last 7 days" data={checkins} dataKey="count" xKey="day" colorKey="violet" /> },
    { id: 'branches', title: 'Branches', span: 'lg:col-span-4', node: (
      <Widget title="Branches" icon={Building2}>
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
      <Widget title={`Collections ${branchId ? '' : '(all branches)'}`} icon={Activity}>
        <DataTable tableId="dash.ta.collections" embedded rows={payments} columns={paymentColumns} />
      </Widget>
    ) },
    { id: 'expiring', title: 'Expiring soon', span: 'lg:col-span-4', node: expiringNode },
    { id: 'expired', title: 'Expired', span: 'lg:col-span-4', node: expiredNode },
  ];

  return (
    <>
      <DashboardFrame title="Overview" layoutId="tenant-admin-v2" actions={branchFilter} kpis={kpis} tiles={tiles} cta={{ to: '/reports', label: 'View Reports' }} />
      {modal}
    </>
  );
}
