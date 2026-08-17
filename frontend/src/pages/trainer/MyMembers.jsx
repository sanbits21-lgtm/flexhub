import { useEffect, useState } from 'react';
import { membersAPI } from '../../services/api';
import DataTable from '../../components/DataTable';

export default function MyMembers() {
  const [members, setMembers] = useState([]);

  useEffect(() => {
    membersAPI.list({}).then((res) => setMembers(res.data.members));
  }, []);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">My Members</h1>
      <DataTable
        columns={[
          { key: 'memberCode', label: 'Code' },
          { key: 'name', label: 'Name' },
          { key: 'membershipStatus', label: 'Status' },
        ]}
        rows={members}
      />
    </div>
  );
}
