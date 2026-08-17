import { useEffect, useState } from 'react';
import { auditLogsAPI } from '../../services/api';
import DataTable from '../../components/DataTable';

const inputClass = 'border rounded px-2 py-1 dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100';
const ACTOR_ROLES = ['super-admin', 'platform-admin', 'tenant-admin', 'branch-manager', 'trainer', 'member'];

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [actions, setActions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const limit = 50;

  const load = () => {
    const params = { page, limit };
    if (actionFilter) params.action = actionFilter;
    if (roleFilter) params.actorRole = roleFilter;
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo) params.dateTo = dateTo;
    auditLogsAPI.list(params).then((res) => {
      setLogs(res.data.logs);
      setTotal(res.data.total);
      setActions(res.data.actions);
    });
  };
  useEffect(() => { load(); }, [page, actionFilter, roleFilter, dateFrom, dateTo]);

  const clearFilters = () => { setActionFilter(''); setRoleFilter(''); setDateFrom(''); setDateTo(''); setPage(1); };
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Audit Log</h1>

      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Action</label>
          <select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(1); }} className={inputClass}>
            <option value="">All actions</option>
            {actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Actor Role</label>
          <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }} className={inputClass}>
            <option value="">All roles</option>
            {ACTOR_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">From</label>
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">To</label>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className={inputClass} />
        </div>
        {(actionFilter || roleFilter || dateFrom || dateTo) && (
          <button onClick={clearFilters} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">Clear filters</button>
        )}
      </div>

      <DataTable
        columns={[
          { key: 'createdAt', label: 'When', render: (r) => new Date(r.createdAt).toLocaleString() },
          { key: 'actor', label: 'Actor', render: (r) => r.actorName || '—', hideOnMobile: true },
          { key: 'actorRole', label: 'Role' },
          { key: 'action', label: 'Action' },
          { key: 'target', label: 'Target', render: (r) => (r.targetType ? `${r.targetType} · ${String(r.targetId || '').slice(-6)}` : '—'), hideOnMobile: true },
          { key: 'ip', label: 'IP', render: (r) => r.ip || '—', hideOnMobile: true },
        ]}
        rows={logs}
      />

      <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
        <span>{total} total · page {page} of {totalPages}</span>
        <div className="flex gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="border rounded px-3 py-1 dark:border-gray-600 disabled:opacity-40">Prev</button>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="border rounded px-3 py-1 dark:border-gray-600 disabled:opacity-40">Next</button>
        </div>
      </div>
    </div>
  );
}
