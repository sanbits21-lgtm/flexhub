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

  const kpis = (
    <>
      <StatCard compact label="Active members" value={data.activeMembers} />
      <StatCard compact label="Today's check-ins" value={data.todaysCheckins} />
      <StatCard compact label="Expiring soon" value={data.expiringSoon} />
      <StatCard compact label="Expired" value={data.expiredCount ?? 0} />
      <StatCard compact label="Maintenance due" value={data.maintenanceDue} />
      <StatCard compact label="Revenue this month" value={`₹${data.revenueThisMonth}`} />
    </>
  );

  const { expiringNode, expiredNode, modal } = useExpiryTiles({
    expiring: data.expiringSoonMembers || [],
    expired: data.expiredMembers || [],
    onRenewed: reload,
  });

  const tiles = [
    { id: 'expiring', span: 'lg:col-span-4', node: expiringNode },
    { id: 'expired', span: 'lg:col-span-4', node: expiredNode },
    { id: 'checkins', span: 'lg:col-span-4', node: (
      <Widget title="Recent check-ins">
        <DataTable tableId="dash.bm.checkins" embedded rows={checkins} columns={checkinColumns} />
      </Widget>
    ) },
    { id: 'payments', span: 'lg:col-span-8', node: (
      <Widget title="Recent payments">
        <DataTable tableId="dash.bm.payments" embedded rows={payments} columns={paymentColumns} />
      </Widget>
    ) },
    { id: 'maintenance', span: 'lg:col-span-4', node: (
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