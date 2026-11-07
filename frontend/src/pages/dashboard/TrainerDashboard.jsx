import { useEffect, useState } from 'react';
import { attendanceAPI, membersAPI } from '../../services/api';
import StatCard from '../../components/StatCard';
import Widget from '../../components/Widget';
import DataTable from '../../components/DataTable';
import { DashboardFrame, checkinColumns, formatDate, orEmpty } from './shared';

export default function TrainerDashboard({ data }) {
  const [members, setMembers] = useState([]);
  const [checkins, setCheckins] = useState([]);

  useEffect(() => {
    membersAPI.list({}).then((r) => setMembers(r.data.members));
    orEmpty(attendanceAPI.list({ limit: 50 }), []).then((r) => setCheckins(r.data));
  }, []);

  const lowIds = new Set((data.lowAttendanceMemberIds || []).map(String));
  const needsAttention = members.filter((m) => lowIds.has(String(m._id)));

  const stat = (id, label, value) => ({ id, title: label, node: <StatCard compact label={label} value={value} /> });
  const kpis = [
    stat('assigned', 'Assigned members', data.assignedMemberCount),
    stat('low-attendance', 'Low attendance', lowIds.size),
  ];

  const tiles = [
    { id: 'members', title: 'My members', span: 'lg:col-span-8 lg:row-span-2', node: (
      <Widget title="My members">
        <DataTable
          tableId="dash.trainer.members"
          embedded
          rows={members}
          columns={[
            { key: 'memberCode', label: 'Code' },
            { key: 'name', label: 'Name' },
            { key: 'membershipStatus', label: 'Status' },
            { key: 'membershipEnd', label: 'Ends', render: (r) => formatDate(r.membershipEnd) },
            { key: 'attention', label: '', render: (r) => (lowIds.has(String(r._id)) ? <span className="text-amber-600 dark:text-amber-400">Low attendance</span> : null) },
          ]}
        />
      </Widget>
    ) },
    { id: 'attention', title: 'Needs attention', span: 'lg:col-span-4', node: (
      <Widget title={`Needs attention (under 3 visits in 14 days) · ${needsAttention.length}`}>
        <DataTable
          tableId="dash.trainer.attention"
          embedded
          rows={needsAttention}
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'phone', label: 'Phone' },
          ]}
        />
      </Widget>
    ) },
    { id: 'checkins', title: 'Recent check-ins', span: 'lg:col-span-4', node: (
      <Widget title="Recent check-ins">
        <DataTable tableId="dash.trainer.checkins" embedded rows={checkins} columns={checkinColumns} />
      </Widget>
    ) },
  ];

  return <DashboardFrame title="Dashboard" layoutId="trainer" kpis={kpis} tiles={tiles} />;
}