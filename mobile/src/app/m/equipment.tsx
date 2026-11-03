import { useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { DateField } from '../../components/DateFields';
import { Banner, Button, Card, Choice, EmptyState, ErrorText, Fab, Field, Loading, Pill, Row, Screen, Section, Select, Sheet } from '../../components/ui';
import { api, type EquipmentRow } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useBranch } from '../../lib/branch';
import { confirmAction } from '../../lib/dialog';
import { cap, fmtDate } from '../../lib/format';
import { useLoad } from '../../lib/hooks';

const STATUSES = [{ value: 'operational', label: 'Working' }, { value: 'under_maintenance', label: 'Maintenance' }, { value: 'retired', label: 'Retired' }] as const;
const TONE = { operational: 'success', under_maintenance: 'warn', retired: 'neutral' } as const;
const blank = { name: '', category: '', status: 'operational' as EquipmentRow['status'], nextServiceDue: '', branchId: '' };

export default function Equipment() {
  const { role } = useAuth();
  const { scoped, branchId, branches, branchName } = useBranch();
  const { data, loading, error, reload } = useLoad(() => api.get<EquipmentRow[]>(scoped('/equipment')), [branchId]);
  const [edit, setEdit] = useState<{ id?: string } | null>(null);
  const [f, setF] = useState({ ...blank });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) => setF((s) => ({ ...s, [k]: v }));

  const openNew = () => { setF({ ...blank }); setErr(null); setEdit({}); };
  const openEdit = (e: EquipmentRow) => { setF({ name: e.name, category: e.category ?? '', status: e.status, nextServiceDue: e.nextServiceDue ? e.nextServiceDue.slice(0, 10) : '', branchId: e.branchId }); setErr(null); setEdit({ id: e._id }); };

  const save = async () => {
    setErr(null);
    if (!f.name.trim()) { setErr('Give the equipment a name.'); return; }
    const branch = branchId || f.branchId;
    if (!edit?.id && role === 'tenant-admin' && !branch) { setErr('Choose a branch.'); return; }
    setSaving(true);
    try {
      const body = { name: f.name.trim(), category: f.category.trim() || undefined, status: f.status, nextServiceDue: f.nextServiceDue || undefined };
      if (edit?.id) await api.put(`/equipment/${edit.id}`, body);
      else await api.post(scoped('/equipment'), { ...body, ...(role === 'tenant-admin' ? { branchId: branch } : {}) });
      setEdit(null);
      await reload();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); } finally { setSaving(false); }
  };
  const retire = async () => {
    if (!edit?.id || !(await confirmAction(`Retire "${f.name}"?`, 'This marks it out of service.', 'Retire'))) return;
    setSaving(true);
    try { await api.delete(`/equipment/${edit.id}`); setEdit(null); await reload(); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not retire.'); } finally { setSaving(false); }
  };
  // One tap for the usual maintenance visit: serviced now, next one in 90 days.
  const markServiced = async () => {
    if (!edit?.id) return;
    const next = new Date(); next.setDate(next.getDate() + 90);
    setSaving(true);
    try { await api.put(`/equipment/${edit.id}`, { status: 'operational', lastServicedAt: new Date().toISOString(), nextServiceDue: next.toISOString() }); setEdit(null); await reload(); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not update.'); } finally { setSaving(false); }
  };

  if (loading && !data) return <Loading />;
  const list = data ?? [];
  const overdue = list.filter((e) => e.status !== 'retired' && e.nextServiceDue && new Date(e.nextServiceDue) < new Date());
  const groups = [{ s: 'operational', t: 'Working' }, { s: 'under_maintenance', t: 'Under maintenance' }, { s: 'retired', t: 'Retired' }] as const;

  return (
    <Screen fab={<Fab title="Add" onPress={openNew} />} onRefresh={reload}>
      <Stack.Screen options={{ title: 'Equipment' }} />
      <ErrorText>{error}</ErrorText>
      {overdue.length > 0 && <Banner tone="warn">{overdue.length} item{overdue.length === 1 ? ' is' : 's are'} overdue for service.</Banner>}
      {list.length === 0 && <Card><EmptyState icon="barbell-outline" title="No equipment yet" text="Add machines and weights to track their maintenance." /></Card>}
      {groups.map(({ s, t }) => {
        const items = list.filter((e) => e.status === s);
        if (!items.length) return null;
        return (
          <View key={s} style={{ gap: 10 }}>
            <Section title={`${t} (${items.length})`} />
            <Card style={{ paddingVertical: 4 }}>
              {items.map((e, i) => {
                const late = e.nextServiceDue && new Date(e.nextServiceDue) < new Date() && s !== 'retired';
                return <Row key={e._id} icon="barbell" tone={late ? 'warn' : undefined} title={e.name} subtitle={[e.category, role === 'tenant-admin' && !branchId ? branchName(e.branchId) : '', e.nextServiceDue ? `service ${late ? 'was due' : 'due'} ${fmtDate(e.nextServiceDue)}` : ''].filter(Boolean).join(' | ')} right={late ? <Pill label="Overdue" tone="warn" /> : <Pill label={cap(e.status)} tone={TONE[e.status]} />} onPress={() => openEdit(e)} last={i === items.length - 1} />;
              })}
            </Card>
          </View>
        );
      })}
      <View style={{ height: 70 }} />

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit equipment' : 'Add equipment'}>
        <Field label="Name" value={f.name} onChangeText={(v) => set('name', v)} autoCapitalize="words" />
        <Field label="Category" value={f.category} onChangeText={(v) => set('category', v)} placeholder="Cardio, Strength..." />
        {role === 'tenant-admin' && !branchId && !edit?.id && <Select label="Branch" value={f.branchId} placeholder="Choose a branch" onChange={(v) => set('branchId', v)} options={branches.map((b) => ({ value: b._id, label: b.name }))} />}
        <Choice label="Status" value={f.status} options={STATUSES} onChange={(v) => set('status', v)} />
        <DateField label="Next service due" value={f.nextServiceDue} onChange={(v) => set('nextServiceDue', v)} clearable />
        <ErrorText>{err}</ErrorText>
        <View style={{ gap: 10, marginTop: 6 }}>
          <Button title="Save" onPress={save} busy={saving} />
          {edit?.id && <Button title="Mark serviced today" icon="build" kind="secondary" onPress={markServiced} disabled={saving} />}
          {edit?.id && f.status !== 'retired' && <Button title="Retire" kind="danger" onPress={retire} disabled={saving} />}
        </View>
      </Sheet>
    </Screen>
  );
}
