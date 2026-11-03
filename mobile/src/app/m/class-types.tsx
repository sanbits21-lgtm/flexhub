import { useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { Button, Card, EmptyState, ErrorText, Fab, Field, Loading, Pill, Row, Screen, Sheet, Toggle } from '../../components/ui';
import { api, type ClassType } from '../../lib/api';
import { useLoad } from '../../lib/hooks';

type Row_ = ClassType & { description?: string; isActive?: boolean };
const blank = { name: '', description: '', durationMinutes: '60', defaultCapacity: '15', isActive: true };

// The templates group classes are scheduled from (Yoga, Zumba, HIIT...). Sessions are scheduled on the Schedule tab.
export default function ClassTypes() {
  const { data, loading, error, reload } = useLoad(() => api.get<Row_[]>('/class-types'));
  const [edit, setEdit] = useState<{ id?: string } | null>(null);
  const [f, setF] = useState({ ...blank });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) => setF((s) => ({ ...s, [k]: v }));

  const openNew = () => { setF({ ...blank }); setErr(null); setEdit({}); };
  const openEdit = (c: Row_) => { setF({ name: c.name, description: c.description ?? '', durationMinutes: String(c.durationMinutes), defaultCapacity: String(c.defaultCapacity), isActive: c.isActive !== false }); setErr(null); setEdit({ id: c._id }); };

  const save = async () => {
    setErr(null);
    if (!f.name.trim()) { setErr('Give the class a name.'); return; }
    setSaving(true);
    try {
      const body = { name: f.name.trim(), description: f.description.trim(), durationMinutes: Number(f.durationMinutes), defaultCapacity: Number(f.defaultCapacity), ...(edit?.id ? { isActive: f.isActive } : {}) };
      if (edit?.id) await api.put(`/class-types/${edit.id}`, body); else await api.post('/class-types', body);
      setEdit(null);
      await reload();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); } finally { setSaving(false); }
  };

  if (loading && !data) return <Loading />;
  const list = data ?? [];
  return (
    <Screen fab={<Fab title="New class" onPress={openNew} />} onRefresh={reload}>
      <Stack.Screen options={{ title: 'Class types' }} />
      <ErrorText>{error}</ErrorText>
      {list.length === 0 ? <Card><EmptyState icon="albums-outline" title="No class types yet" text="Create Yoga, Zumba or HIIT, then schedule sessions on the Schedule tab." /></Card> : (
        <Card style={{ paddingVertical: 4 }}>
          {list.map((c, i) => <Row key={c._id} icon="albums" title={c.name} subtitle={`${c.durationMinutes} min | up to ${c.defaultCapacity} people${c.description ? ` | ${c.description}` : ''}`} right={c.isActive === false ? <Pill label="Inactive" tone="neutral" /> : undefined} onPress={() => openEdit(c)} last={i === list.length - 1} />)}
        </Card>
      )}
      <View style={{ height: 70 }} />
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit class' : 'New class type'}>
        <Field label="Name" value={f.name} onChangeText={(v) => set('name', v)} placeholder="Morning yoga" />
        <Field label="Description (optional)" value={f.description} onChangeText={(v) => set('description', v)} />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}><Field label="Minutes" value={f.durationMinutes} onChangeText={(v) => set('durationMinutes', v.replace(/\D/g, ''))} keyboardType="number-pad" /></View>
          <View style={{ flex: 1 }}><Field label="Capacity" value={f.defaultCapacity} onChangeText={(v) => set('defaultCapacity', v.replace(/\D/g, ''))} keyboardType="number-pad" /></View>
        </View>
        {edit?.id && <Toggle label="Active" hint="Inactive classes cannot be scheduled" value={f.isActive} onChange={(v) => set('isActive', v)} />}
        <ErrorText>{err}</ErrorText>
        <Button title="Save" onPress={save} busy={saving} />
      </Sheet>
    </Screen>
  );
}
