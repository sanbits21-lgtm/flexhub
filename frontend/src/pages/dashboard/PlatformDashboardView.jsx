import { useEffect, useState } from 'react';
import { auditLogsAPI, tenantsAPI } from '../../services/api';
import StatCard from '../../components/StatCard';
import Widget from '../../components/Widget';
import DataTable from '../../components/DataTable';
import { DashboardFrame, formatDate, formatDateTime, orEmpty } from './shared';

export default function PlatformDashboardView({ data }) {
  const [tenants, setTenants] = useState([]);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    tenantsAPI.list().then((r) => setTenants(r.data));
    orEmpty(auditLogsAPI.list({ page: 1, limit: 50 }), { logs: [] }).then((r) => setLogs(r.data.logs));
  }, []);

  const stat = (id, label, value) => ({ id, title: label, node: <StatCard compact label={label} value={value} /> });
  const kpis = [
    stat('total-tenants', 'Total tenants', data.totalTenants),
    stat('active-tenants', 'Active tenants', data.activeTenants),
    stat('mrr', 'MRR', `₹${data.mrr}`),
  ];

  const tiles = [
    { id: 'plans', title: 'Tenants by plan', span: 'lg:col-span-4', node: (
      <Widget title="Tenants by plan">
        <DataTable
          tableId="dash.platform.plans"
          embedded
          rowKey="_id"
          rows={data.tenantsByPlan || []}
          columns={[
            { key: '_id', label: 'Plan' },
            { key: 'count', label: 'Tenants' },
          ]}
        />
      </Widget>
    ) },
    { id: 'tenants', title: 'Tenants', span: 'lg:col-span-8', node: (
      <Widget title="Tenants">
        <DataTable
          tableId="dash.platform.tenants"
          embedded
          rows={tenants}
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'billingPlan', label: 'Plan' },
            { key: 'billingStatus', label: 'Billing' },
            { key: 'isActive', label: 'Status', render: (r) => (r.isActive ? 'Active' : 'Suspended') },
            { key: 'createdAt', label: 'Created', render: (r) => formatDate(r.createdAt) },
          ]}
        />
      </Widget>
    ) },
    { id: 'activity', title: 'Recent activity', span: 'lg:col-span-12', node: (
      <Widget title="Recent activity">
        <DataTable
          tableId="dash.platform.activity"
          embedded
          rows={logs}
          columns={[
            { key: 'createdAt', label: 'When', render: (r) => formatDateTime(r.createdAt) },
            { key: 'actorRole', label: 'Role' },
            { key: 'action', label: 'Action' },
            { key: 'targetType', label: 'Target' },
          ]}
        />
      </Widget>
    ) },
  ];

  return <DashboardFrame title="Platform overview" layoutId="platform" kpis={kpis} tiles={tiles} />;
}