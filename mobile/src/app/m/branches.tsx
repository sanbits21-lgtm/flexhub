import { useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { Banner, Button, Card, EmptyState, ErrorText, Fab, Field, Loading, Row, Screen, Sheet } from '../../components/ui';
import { api, type ManagerSummary } from '../../lib/api';
import { useBranch, type Branch } from '../../lib/branch';
import { useLoad } from '../../lib/hooks';

export default function Branches() {
  const { branches, reloadBranches } = useBranch();
  const { data: summary, loading, error, reload } = useLoad(() => api.get<ManagerSummary>('/dashboard/summary'));
  const [add, setAdd] = useState(false);
  const [mgrFor, setMgrFor] = useState<Branch | null>(null);
  const [f, setF] = useState({ name: '', phone: '', capacity: '' });
  const [m, setM] = useState({ name: '', email: '', phone: '', password: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const refresh = async () => { await Promise.all([reload(), reloadBranches()]); };
  const saveBranch = async () => {
    setErr(null);
    if (!f.name.trim()) { setErr('Give the branch a name.'); return; }
    setSaving(true);
    try { await api.post('/branches', { name: f.name.trim(), phone: f.phone.trim() || undefined, capacity: f.capacity ? Number(f.capacity) : undefined, timezone: 'Asia/Kolkata' }); setAdd(false); setF({ name: '', phone: '', capacity: '' }); await refresh(); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not add.'); } finally { setSaving(false); }
  };
  const saveManager = async () => {
    setErr(null);
    if (!m.name.trim() || !m.email.trim() || !m.phone.trim() || m.password.length < 8) { setErr('Name, email, phone and a password of at least 8 characters are needed.'); return; }
    setSaving(true);
    try { await api.post(`/branches/${mgrFor!._id}/managers`, { name: m.name.trim(), email: m.email.trim(), phone: m.phone.trim(), password: m.password }); setDone(`${m.name.trim()} can now sign in as the manager of ${mgrFor!.name}.`); setMgrFor(null); setM({ name: '', email: '', phone: '', password: '' }); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not add the manager.'); } finally { setSaving(false); }
  };

  if (loading && !summary) return <Loading />;
  const stats = new Map((summary?.perBranch ?? []).map((b) => [b.branchId, b]));
  return (
    <Screen fab={<Fab title="Add branch" onPress={() => { setErr(null); setAdd(true); }} />} onRefresh={refresh}>
      <Stack.Screen options={{ title: 'Branches' }} />
      <ErrorText>{error}</ErrorText>
      {done && <Banner tone="success">{done}</Banner>}
      {branches.length === 0 ? <Card><EmptyState icon="storefront-outline" title="No branches yet" /></Card> : (
        <Card style={{ paddingVertical: 4 }}>
          {branches.map((b, i) => {
            const s = stats.get(b._id);
            return <Row key={b._id} icon="storefront" title={b.name} subtitle={s ? `${s.activeMembers} active | ${s.trainerCount} trainers | ${s.equipmentCount} equipment` : b.phone} right={<Button title="Add manager" small kind="secondary" onPress={() => { setErr(null); setDone(null); setMgrFor(b); }} />} last={i === branches.length - 1} />;
          })}
        </Card>
      )}
      <View style={{ height: 70 }} />

      <Sheet open={add} onClose={() => setAdd(false)} title="New branch">
        <Field label="Branch name" value={f.name} onChangeText={(v) => setF((s) => ({ ...s, name: v }))} autoCapitalize="words" />
        <Field label="Phone (optional)" value={f.phone} onChangeText={(v) => setF((s) => ({ ...s, phone: v }))} keyboardType="phone-pad" />
        <Field label="Capacity (optional)" value={f.capacity} onChangeText={(v) => setF((s) => ({ ...s, capacity: v.replace(/\D/g, '') }))} keyboardType="number-pad" />
        <ErrorText>{err}</ErrorText>
        <Button title="Add branch" onPress={saveBranch} busy={saving} />
      </Sheet>

      <Sheet open={!!mgrFor} onClose={() => setMgrFor(null)} title={`Manager for ${mgrFor?.name ?? ''}`}>
        <Field label="Full name" value={m.name} onChangeText={(v) => setM((s) => ({ ...s, name: v }))} autoCapitalize="words" />
        <Field label="Email (their login)" value={m.email} onChangeText={(v) => setM((s) => ({ ...s, email: v }))} keyboardType="email-address" autoCapitalize="none" />
        <Field label="Phone" value={m.phone} onChangeText={(v) => setM((s) => ({ ...s, phone: v }))} keyboardType="phone-pad" />
        <Field label="Password" hint="At least 8 characters" value={m.password} onChangeText={(v) => setM((s) => ({ ...s, password: v }))} secureTextEntry autoCapitalize="none" />
        <ErrorText>{err}</ErrorText>
        <Button title="Create manager" onPress={saveManager} busy={saving} />
      </Sheet>
    </Screen>
  );
}
