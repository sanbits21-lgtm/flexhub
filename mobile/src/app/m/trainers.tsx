import { useState } from 'react';
import { Stack, router } from 'expo-router';
import { View } from 'react-native';
import { Banner, Button, Card, EmptyState, ErrorText, Fab, Initials, Loading, Pill, Row, Screen, Sheet } from '../../components/ui';
import { api, type StaffRow } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useBranch } from '../../lib/branch';
import { confirmAction } from '../../lib/dialog';
import { useLoad } from '../../lib/hooks';

export default function Trainers() {
  const { role } = useAuth();
  const { scoped, branchId, branchName } = useBranch();
  const { data, loading, error, reload } = useLoad(() => api.get<StaffRow[]>(scoped('/staff?role=trainer')), [branchId]);
  const [open, setOpen] = useState<StaffRow | null>(null);
  const [creds, setCreds] = useState<{ name: string; email: string; password: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (loading && !data) return <Loading />;
  const list = data ?? [];

  const run = async (tag: string, fn: () => Promise<void>) => {
    setBusy(tag); setErr(null);
    try { await fn(); await reload(); } catch (e) { setErr(e instanceof Error ? e.message : 'That did not work.'); } finally { setBusy(null); }
  };
  const reset = (t: StaffRow) => run('reset', async () => { const c = await api.post<{ name: string; email: string; password: string }>(`/staff/${t._id}/reset-password`); setOpen(null); setCreds(c); });
  const toggle = async (t: StaffRow) => {
    if (t.isActive && !(await confirmAction(`Deactivate ${t.name}?`, 'They can no longer sign in. Their members keep their assignment.', 'Deactivate'))) return;
    await run('toggle', async () => { await (t.isActive ? api.delete(`/staff/${t._id}`) : api.put(`/staff/${t._id}`, { name: t.name, isActive: true })); setOpen(null); });
  };

  return (
    <Screen fab={<Fab title="Add trainer" icon="person-add" onPress={() => router.push('/m/trainer-form')} />} onRefresh={reload}>
      <Stack.Screen options={{ title: 'Trainers' }} />
      <ErrorText>{error}</ErrorText>
      {list.length === 0 ? <Card><EmptyState icon="people-circle-outline" title="No trainers yet" text="Add your first trainer, then assign members to them." /></Card> : (
        <Card style={{ paddingVertical: 4 }}>
          {list.map((t, i) => (
            <Row key={t._id} title={t.name} subtitle={[t.specialization, role === 'tenant-admin' && t.branchId ? branchName(t.branchId) : '', t.email].filter(Boolean).join(' | ')}
              right={<Pill label={t.isActive ? 'Active' : 'Inactive'} tone={t.isActive ? 'success' : 'neutral'} />} onPress={() => setOpen(t)} last={i === list.length - 1} />
          ))}
        </Card>
      )}
      <View style={{ height: 70 }} />

      <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.name}>
        {open && (
          <View style={{ gap: 10 }}>
            <Row icon="mail" title={open.email} subtitle={open.phone} last />
            <ErrorText>{err}</ErrorText>
            <Button title="Edit details" icon="create" kind="secondary" onPress={() => { const id = open._id; setOpen(null); router.push({ pathname: '/m/trainer-form', params: { id } }); }} />
            <Button title="Reset password" icon="key" kind="secondary" busy={busy === 'reset'} disabled={!open.isActive} onPress={() => reset(open)} />
            <Button title={open.isActive ? 'Deactivate' : 'Reactivate'} icon={open.isActive ? 'close-circle' : 'checkmark-circle'} kind={open.isActive ? 'danger' : 'primary'} busy={busy === 'toggle'} onPress={() => toggle(open)} />
          </View>
        )}
      </Sheet>

      <Sheet open={!!creds} onClose={() => setCreds(null)} title="New temporary password">
        {creds && (
          <View style={{ gap: 12 }}>
            <Banner tone="info">Give these to {creds.name}. The password is shown once. They are signed out everywhere and can change it under Account.</Banner>
            <Row title={creds.email} subtitle="Email" />
            <Row title={creds.password} subtitle="Temporary password" last />
            <Button title="Done" onPress={() => setCreds(null)} />
          </View>
        )}
      </Sheet>
    </Screen>
  );
}
