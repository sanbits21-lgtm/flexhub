import { useEffect, useState } from 'react';
import { attendanceAPI, membersAPI } from '../../services/api';
import DataTable from '../../components/DataTable';

export default function Attendance() {
  const [records, setRecords] = useState([]);
  const [members, setMembers] = useState([]);
  const [selectedMember, setSelectedMember] = useState('');

  const load = () => attendanceAPI.list({}).then((res) => setRecords(res.data));
  useEffect(() => {
    load();
    membersAPI.list({}).then((res) => setMembers(res.data.members));
  }, []);

  const handleCheckIn = async (e) => {
    e.preventDefault();
    if (!selectedMember) return;
    await attendanceAPI.checkIn(selectedMember);
    load();
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Attendance</h1>

      <form onSubmit={handleCheckIn} className="bg-white dark:bg-gray-800 dark:border dark:border-gray-700 p-4 rounded-2xl shadow flex flex-wrap gap-3 items-end">
        <select value={selectedMember} onChange={(e) => setSelectedMember(e.target.value)} className="border rounded px-2 py-1 dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100">
          <option value="">Select member</option>
          {members.map((m) => (
            <option key={m._id} value={m._id}>{m.name} ({m.memberCode})</option>
          ))}
        </select>
        <button type="submit" className="bg-gray-900 text-white rounded px-4 py-2 dark:bg-accent dark:text-accent-ink dark:font-semibold dark:hover:bg-accent-hover">Check In</button>
      </form>

      <DataTable tableId="attendance"
        columns={[
          { key: 'member', label: 'Member', render: (r) => r.memberId?.name },
          { key: 'checkInAt', label: 'Check In', render: (r) => new Date(r.checkInAt).toLocaleString() },
          { key: 'checkOutAt', label: 'Check Out', render: (r) => (r.checkOutAt ? new Date(r.checkOutAt).toLocaleString() : '-') },
          { key: 'method', label: 'Method' },
        ]}
        rows={records}
      />
    </div>
  );
}
