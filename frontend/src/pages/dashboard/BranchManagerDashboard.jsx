import { useEffect, useState } from 'react';
import { CalendarCheck, CreditCard, IndianRupee, QrCode, UserPlus, Users, Wrench } from 'lucide-react';
import { attendanceAPI, equipmentAPI, paymentsAPI } from '../../services/api';
import StatCard from '../../components/StatCard';
import Widget from '../../components/Widget';
import DataTable from '../../components/DataTable';
import { QuickActions } from '../../components/DashboardCards';
import { DashboardFrame, useExpiryTiles, paymentColumns, checkinColumns, formatDate, orEmpty } from './shared';

export default function BranchManagerDashboard({ data, reload }) {
  const [payments, setPayments] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [maintenance, setMaintenance] = useState([]);

  useEffect(() => {
    orEmpty(paymentsAPI.list({ limit: 50 }), { payments: [] }).then((r) => setPayments(r.data.payments));
    orEmpty(attendanceAPI.list({ limit: 50 }), []).then((r) => setCheckins(r.data));
    orEmpty(equipmentAPI.maintenanceDue(), []).then((r) => setMaintenance(r.data));
  }, []);

  const kpi = (id, title, node) => ({ id, title, node });
  const kpis = [
    kpi('active', 'Active members', <StatCard icon={Users} tone="lime" label="Active members" value={Number(data.activeMembers || 0).toLocaleString('en-IN')} />),
    kpi('todays-checkins', "Today's check-ins", <StatCard icon={CalendarCheck} tone="blue" label="Today's check-ins" value={data.todaysCheckins} />),
    kpi('revenue', 'Revenue this month', <StatCard icon={IndianRupee} tone="violet" label="Revenue this month" value={`₹${Number(data.revenueThisMonth || 0).toLocaleString('en-IN')}`} />),
    kpi('maintenance', 'Maintenance due', <StatCard icon={Wrench} tone={data.maintenanceDue ? 'amber' : 'lime'} label="Maintenance due" value={data.maintenanceDue} />),
  ];

  const { expiringNode, expiredNode, modal } = useExpiryTiles({
    expiring: data.expiringSoonMembers || [],
    expired: data.expiredMembers || [],
    onRenewed: reload,
  });

  const tiles = [
    { id: 'payments', title: 'Recent payments', span: 'lg:col-span-8', node: (
      <Widget title="Recent payments" icon={CreditCard}>
        <DataTable tableId="dash.bm.payments" embedded rows={payments} columns={paymentColumns} />
      </Widget>
    ) },
    { id: 'quick', title: 'Quick actions', span: 'lg:col-span-4', node: (
      <QuickActions actions={[
        { label: 'Add Member', to: '/members?add=1', icon: UserPlus },
        { label: 'Record Payment', to: '/payments', icon: CreditCard },
        { label: 'Attendance', to: '/attendance', icon: CalendarCheck },
        { label: 'Member App QR', to: '/member-app-qr', icon: QrCode },
      ]} />
    ) },
    { id: 'expiring', title: 'Expiring soon', span: 'lg:col-span-4', node: expiringNode },
    { id: 'expired', title: 'Expired', span: 'lg:col-span-4', node: expiredNode },
    { id: 'maintenance', title: 'Maintenance due', span: 'lg:col-span-4', node: (
      <Widget title={`Maintenance due · ${maintenance.length}`} icon={Wrench}>
        <DataTable
          tableId="dash.bm.maintenance"
          embedded
          rows={maintenance}
          columns={[
            { key: 'name', label: 'Equipment' },
            { key: 'category', label: 'Category' },
            { key: 'nextServiceDue', label: 'Due', render: (r) => formatDate(r.nextServiceDue) },
          ]}
        />
      </Widget>
    ) },
    { id: 'checkins', title: 'Recent check-ins', span: 'lg:col-span-12', node: (
      <Widget title="Recent check-ins" icon={CalendarCheck}>
        <DataTable tableId="dash.bm.checkins" embedded rows={checkins} columns={checkinColumns} />
      </Widget>
    ) },
  ];

  return (
    <>
      <DashboardFrame title="Overview" layoutId="branch-manager-v2" kpis={kpis} tiles={tiles} cta={{ to: '/members', label: 'View Members' }} />
      {modal}
    </>
  );
}
