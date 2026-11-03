import { useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { Banner, Button, Card, Choice, EmptyState, ErrorText, Fab, Field, Loading, Pill, Row, Screen, Select, Sheet, Toggle } from '../../components/ui';
import { api, type PlanRow } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useBranch } from '../../lib/branch';
import { confirmAction } from '../../lib/dialog';
import { cap, rupees } from '../../lib/format';
import { useLoad } from '../../lib/hooks';

const DURATIONS = [{ value: 'monthly', label: 'Monthly' }, { value: 'quarterly', label: 'Quarterly' }, { value: 'half_yearly', label: 'Half-yearly' }, { value: 'yearly', label: 'Yearly' }] as const;
const blank = { name: '', durationUnit: 'monthly' as PlanRow['durationUnit'], price: '', description: '', branchId: '', isActive: true };

// Everyone can see the catalogue (a manager needs it to renew members); only the gym owner edits it.
export default function Plans() {
  const { role } = useAuth();
  const admin = role === 'tenant-admin';
  const { branches, branchName } = useBranch();
  const { data, loading, error, reload } = useLoad(() => api.get<PlanRow[]>('/membership-plans'));
  const [edit, setEdit] = useState<{ id?: string } | null>(null);
  const [f, setF] = useState({ ...blank });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) => setF((s) => ({ ...s, [k]: v }));

  const openNew = () => { setF({ ...blank }); setErr(null); setEdit({}); };
  const openEdit = (p: PlanRow) => { if (!admin) return; setF({ name: p.name, durationUnit: p.durationUnit, price: String(p.price), description: p.description ?? '', branchId: p.branchId ?? '', isActive: p.isActive }); setErr(null); setEdit({ id: p._id }); };

  const save = async () => {
    setErr(null);
    if (!f.name.trim() || f.price === '') { setErr('A plan needs a name and a price.'); return; }
    setSaving(true);
    try {
      const body = { name: f.name.trim(), durationUnit: f.durationUnit, price: Number(f.price), description: f.description.trim(), branchId: f.branchId || null, ...(edit?.id ? { isActive: f.isActive } : {}) };
      if (edit?.id) await api.put(`/membership-plans/${edit.id}`, body); else await api.post('/membership-plans', body);
      setEdit(null);
      await reload();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); } finally { setSaving(false); }
  };
  const remove = async () => {
    if (!edit?.id || !(await confirmAction(`Deactivate "${f.name}"?`, 'New members can no longer buy it. Existing members keep it.', 'Deactivate'))) return;
    setSaving(true);
    try { await api.delete(`/membership-plans/${edit.id}`); setEdit(null); await reload(); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not deactivate.'); } finally { setSaving(false); }
  };

  if (loading && !data) return <Loading />;
  const list = data ?? [];
  return (
    <Screen fab={admin ? <Fab title="New plan" onPress={openNew} /> : undefined} onRefresh={reload}>
      <Stack.Screen options={{ title: 'Membership plans' }} />
      <ErrorText>{error}</ErrorText>
      {!admin && <Banner tone="info">Plans are set by the gym owner. You can use them when renewing or enrolling members.</Banner>}
      {list.length === 0 ? <Card><EmptyState icon="pricetags-outline" title="No plans yet" text={admin ? 'Create the plans members can buy.' : undefined} /></Card> : (
        <Card style={{ paddingVertical: 4 }}>
          {list.map((p, i) => (
            <Row key={p._id} icon="pricetag" title={p.name} subtitle={`${cap(p.durationUnit)}${p.branchId ? ` | ${branchName(p.branchId) || 'one branch'}` : ' | all branches'}${p.description ? ` | ${p.description}` : ''}`}
              right={<View style={{ alignItems: 'flex-end', gap: 4 }}><Pill label={rupees(p.price)} tone="accent" />{!p.isActive && <Pill label="Inactive" tone="neutral" />}</View>} onPress={admin ? () => openEdit(p) : undefined} last={i === list.length - 1} />
          ))}
        </Card>
      )}
      <View style={{ height: 70 }} />

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit plan' : 'New plan'}>
        <Field label="Name" value={f.name} onChangeText={(v) => set('name', v)} placeholder="Gold monthly" />
        <Choice label="Duration" value={f.durationUnit} options={DURATIONS} onChange={(v) => set('durationUnit', v)} />
        <Field label="Price (Rs)" value={f.price} onChangeText={(v) => set('price', v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" />
        <Field label="Description (optional)" value={f.description} onChangeText={(v) => set('description', v)} />
        <Select label="Available at" value={f.branchId} placeholder="All branches" clearLabel="All branches" onChange={(v) => set('branchId', v)} options={branches.map((b) => ({ value: b._id, label: b.name }))} />
        {edit?.id && <Toggle label="Active" hint="Inactive plans cannot be sold" value={f.isActive} onChange={(v) => set('isActive', v)} />}
        <ErrorText>{err}</ErrorText>
        <View style={{ gap: 10, marginTop: 6 }}>
          <Button title="Save" onPress={save} busy={saving} />
          {edit?.id && <Button title="Deactivate plan" kind="danger" onPress={remove} disabled={saving} />}
        </View>
      </Sheet>
    </Screen>
  );
}
