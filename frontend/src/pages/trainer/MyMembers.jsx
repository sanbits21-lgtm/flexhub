import { useEffect, useState } from 'react';
import { membersAPI } from '../../services/api';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import MemberPlansModal from '../../components/MemberPlansModal';

const inputClass = 'border rounded px-2 py-1 w-full dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100';
const todayStr = () => new Date().toISOString().slice(0, 10);
const emptyForm = { name: '', phone: '', email: '', gender: '', dob: '' };
const errorMessage = (err) => err?.response?.data?.message || err?.message || 'Something went wrong. Please try again.';

export default function MyMembers() {
  const [members, setMembers] = useState([]);
  const [plansMember, setPlansMember] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [phoneTaken, setPhoneTaken] = useState(false);

  const load = () => membersAPI.list({}).then((res) => setMembers(res.data.members));
  useEffect(() => { load(); }, []);

  // Warn (never block) when the number already belongs to a member of this gym.
  useEffect(() => {
    if (!adding || form.phone.replace(/\D/g, '').length < 6) { setPhoneTaken(false); return undefined; }
    let cancelled = false;
    const t = setTimeout(() => {
      membersAPI.phoneCheck({ phone: form.phone })
        .then((res) => { if (!cancelled) setPhoneTaken(!!res.data.duplicate); })
        .catch(() => { if (!cancelled) setPhoneTaken(false); });
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [form.phone, adding]);

  const close = () => { setAdding(false); setForm(emptyForm); setError(''); setPhoneTaken(false); };

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (phoneTaken && !window.confirm('This phone number is already used by another member.\n\nAdd this member anyway?')) return;
    setSaving(true);
    setError('');
    try {
      // The server places the member in your branch and assigns them to you.
      const { data } = await membersAPI.create({
        name: form.name,
        phone: form.phone,
        ...(form.email ? { email: form.email } : {}),
        ...(form.gender ? { gender: form.gender } : {}),
        ...(form.dob ? { dob: form.dob } : {}),
      });
      await load();
      close();
      setPlansMember(data); // straight on to their workout and diet plans
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">My Members</h1>
        <button onClick={() => setAdding(true)} className="rounded bg-purple-700 px-3 py-1.5 text-sm text-white hover:bg-purple-800">+ Add member</button>
      </div>
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

      <Modal open={adding} onClose={close} title="Add member">
        {error && <div role="alert" className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">{error}</div>}
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Name</label>
            <input autoFocus required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Phone</label>
              <input type="tel" inputMode="numeric" pattern="[0-9+\-\s]{6,15}" title="6-15 digits" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputClass} />
              {phoneTaken && <p role="status" className="text-xs text-amber-700 dark:text-amber-400 mt-1">This number is already used by another member. You can still add them.</p>}
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Email (optional)</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Date of birth (optional)</label>
              <input type="date" max={todayStr()} value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Gender (optional)</label>
              <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className={inputClass}>
                <option value="">—</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
                <option value="prefer_not_say">Prefer not to say</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">They are added to your members. The front desk assigns their membership plan and takes payment.</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={close} className="rounded border px-3 py-1.5 text-sm dark:border-gray-600 dark:text-gray-200">Cancel</button>
            <button type="submit" disabled={saving} className="rounded bg-purple-700 px-3 py-1.5 text-sm text-white hover:bg-purple-800 disabled:opacity-60">{saving ? 'Adding…' : 'Add member'}</button>
          </div>
        </form>
      </Modal>

      <MemberPlansModal open={!!plansMember} member={plansMember} onClose={() => setPlansMember(null)} />
    </div>
  );
}
