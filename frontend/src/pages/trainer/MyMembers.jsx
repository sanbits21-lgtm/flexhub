import { useEffect, useState } from 'react';
import { membersAPI } from '../../services/api';
import DataTable from '../../components/DataTable';
import MemberPlansModal from '../../components/MemberPlansModal';

export default function MyMembers() {
  const [members, setMembers] = useState([]);
  const [plansMember, setPlansMember] = useState(null);

  useEffect(() => {
    membersAPI.list({}).then((res) => setMembers(res.data.members));
  }, []);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">My Members</h1>
      <DataTable tableId="trainer.myMembers"
        columns={[
          { key: 'memberCode', label: 'Code' },
          { key: 'name', label: 'Name' },
          { key: 'membershipStatus', label: 'Status' },
          {
            key: 'actions',
            label: 'Actions',
            render: (row) => (
              <button onClick={() => setPlansMember(row)} className="text-purple-700 dark:text-purple-400 hover:underline">Workout & diet plans</button>
            ),
          },
        ]}
        rows={members}
      />
      <MemberPlansModal open={!!plansMember} member={plansMember} onClose={() => setPlansMember(null)} />
    </div>
  );
}
