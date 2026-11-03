import { useEffect, useState } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Banner, Button, Card, Field, Loading, Screen, Select } from '../../components/ui';
import { api, type StaffRow } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useBranch } from '../../lib/branch';

export default function TrainerForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = !!id;
  const { role } = useAuth();
  const { branches, branchId: scopedBranch, scoped } = useBranch();
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '', specialization: '', salary: '', branchId: '' });
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    if (!editing) return;
    api.get<StaffRow[]>(scoped('/staff?role=trainer')).then((rows) => {
      const t = rows.find((r) => r._id === id);
      if (t) setF((s) => ({ ...s, name: t.name, email: t.email, phone: t.phone, specialization: t.specialization ?? '', salary: t.salary ? String(t.salary) : '' }));
    }).catch((e) => setError(e instanceof Error ? e.message : 'Could not load.')).finally(() => setLoading(false));
  }, [id]);

  const submit = async () => {
    setError(null);
    const problems: Record<string, string> = {};
    if (!f.name.trim()) problems.name = 'Enter the trainer\'s name.';
    if (!f.phone.trim()) problems.phone = 'Enter a phone number.';
    if (!editing && !/^\S+@\S+\.\S+$/.test(f.email.trim())) problems.email = 'Enter a valid email: it is their login.';
    if (!editing && f.password.length < 8) problems.password = 'Use at least 8 characters.';
    const branch = scopedBranch || f.branchId;
    if (!editing && role === 'tenant-admin' && !branch) problems.branch = 'Choose a branch.';
    setFe(problems);
    if (Object.keys(problems).length) { setError('Please fix the highlighted fields.'); return; }
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/staff/${id}`, { name: f.name.trim(), phone: f.phone.trim(), specialization: f.specialization.trim(), ...(role === 'tenant-admin' && f.salary !== '' ? { salary: Number(f.salary) } : {}) });
      } else {
        await api.post('/staff', { name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim(), password: f.password, specialization: f.specialization.trim() || undefined, ...(role === 'tenant-admin' ? { branchId: branch } : {}) });
      }
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;
  return (
    <Screen>
      <Stack.Screen options={{ title: editing ? 'Edit trainer' : 'New trainer' }} />
      <Card>
        <Field label="Full name" value={f.name} onChangeText={(v) => set('name', v)} autoCapitalize="words" error={fe.name} />
        <Field label="Phone" value={f.phone} onChangeText={(v) => set('phone', v)} keyboardType="phone-pad" error={fe.phone} />
        {!editing && <Field label="Email (their login)" value={f.email} onChangeText={(v) => set('email', v)} keyboardType="email-address" autoCapitalize="none" error={fe.email} />}
        {!editing && <Field label="Password" hint="At least 8 characters. They can change it in the app." value={f.password} onChangeText={(v) => set('password', v)} secureTextEntry autoCapitalize="none" error={fe.password} />}
        <Field label="Specialization (optional)" value={f.specialization} onChangeText={(v) => set('specialization', v)} placeholder="Strength, yoga, rehab..." />
        {editing && role === 'tenant-admin' && <Field label="Monthly salary (Rs)" value={f.salary} onChangeText={(v) => set('salary', v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" />}
        {!editing && role === 'tenant-admin' && !scopedBranch && (
          <Select label="Branch" value={f.branchId} placeholder="Choose a branch" onChange={(v) => set('branchId', v)} options={branches.map((b) => ({ value: b._id, label: b.name }))} />
        )}
      </Card>
      {editing && <Banner tone="info">To change a trainer's password, use Reset password on the Trainers list.</Banner>}
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Button title={editing ? 'Save changes' : 'Add trainer'} onPress={submit} busy={saving} />
    </Screen>
  );
}
