import { useEffect, useState } from 'react';
import { attendanceAPI, equipmentAPI, paymentsAPI } from '../../services/api';
import StatCard from '../../components/StatCard';
import Widget from '../../components/Widget';
import DataTable from '../../components/DataTable';
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

  const stat = (id, label, value) => ({ id, title: label, node: <StatCard compact label={label} value={value} /> });
  const kpis = [
    stat('active', 'Active members', data.activeMembers),
    stat('todays-checkins', "Today's check-ins", data.todaysCheckins),
    stat('expiring', 'Expiring soon', data.expiringSoon),
    stat('expired', 'Expired', data.expiredCount ?? 0),
    stat('maintenance', 'Maintenance due', data.maintenanceDue),
    stat('revenue', 'Revenue this month', `₹${data.revenueThisMonth}`),
  ];

  const { expiringNode, expiredNode, modal } = useExpiryTiles({
    expiring: data.expiringSoonMembers || [],
    expired: data.expiredMembers || [],
    onRenewed: reload,
  });

  const tiles = [
    { id: 'expiring', title: 'Expiring soon', span: 'lg:col-span-4', node: expiringNode },
    { id: 'expired', title: 'Expired', span: 'lg:col-span-4', node: expiredNode },
    { id: 'checkins', title: 'Recent check-ins', span: 'lg:col-span-4', node: (
      <Widget title="Recent check-ins">
        <DataTable tableId="dash.bm.checkins" embedded rows={checkins} columns={checkinColumns} />
      </Widget>
    ) },
    { id: 'payments', title: 'Recent payments', span: 'lg:col-span-8', node: (
      <Widget title="Recent payments">
        <DataTable tableId="dash.bm.payments" embedded rows={payments} columns={paymentColumns} />
      </Widget>
    ) },
    { id: 'maintenance', title: 'Maintenance due', span: 'lg:col-span-4', node: (
      <Widget title={`Maintenance due · ${maintenance.length}`}>
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
  ];

  return (
    <>
      <DashboardFrame title="Dashboard" layoutId="branch-manager" kpis={kpis} tiles={tiles} />
      {modal}
    </>
  );
}