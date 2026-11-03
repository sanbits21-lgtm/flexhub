import { useState } from 'react';
import { Stack } from 'expo-router';
import { Button, Card, EmptyState, ErrorText, Field, Hero, Loading, Muted, Row, Screen, Section, Sheet, Stat, StatGrid } from '../../components/ui';
import { api, type TrainerReportRow } from '../../lib/api';
import { rupees } from '../../lib/format';
import { useLoad } from '../../lib/hooks';

export default function TrainerReport() {
  const { data, loading, error, reload } = useLoad(() => api.get<TrainerReportRow[]>('/staff/trainer-report'));
  const [edit, setEdit] = useState<TrainerReportRow | null>(null);
  const [salary, setSalary] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!edit) return;
    setSaving(true); setErr(null);
    try { await api.put(`/staff/${edit._id}`, { name: edit.name, salary: salary === '' ? null : Number(salary) }); setEdit(null); await reload(); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); } finally { setSaving(false); }
  };

  if (loading && !data) return <Loading />;
  const list = data ?? [];
  const collections = list.reduce((s, t) => s + t.collections, 0);
  const payroll = list.reduce((s, t) => s + (Number(t.salary) || 0), 0);
  return (
    <Screen onRefresh={reload}>
      <Stack.Screen options={{ title: 'Collections & salary' }} />
      <ErrorText>{error}</ErrorText>
      <Hero label="Collected from assigned members" value={rupees(collections)} caption="All time" />
      <StatGrid><Stat label="Monthly payroll" value={rupees(payroll)} /><Stat label="Trainers" value={list.length} /></StatGrid>
      <Section title="By trainer" />
      {list.length === 0 ? <Card><EmptyState icon="cash-outline" title="No trainers yet" /></Card> : (
        <Card style={{ paddingVertical: 4 }}>
          {list.map((t, i) => (
            <Row key={t._id} title={t.name} subtitle={`${t.assignedMemberCount} members | ${rupees(t.collections)} collected${t.branchName ? ` | ${t.branchName}` : ''}`}
              right={<Muted>{t.salary ? `${rupees(t.salary)}/mo` : 'No salary'}</Muted>} onPress={() => { setEdit(t); setSalary(t.salary ? String(t.salary) : ''); setErr(null); }} last={i === list.length - 1} />
          ))}
        </Card>
      )}
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={`Salary: ${edit?.name ?? ''}`}>
        <Field label="Monthly salary (Rs)" value={salary} onChangeText={(v) => setSalary(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" hint="Leave empty to clear" />
        <ErrorText>{err}</ErrorText>
        <Button title="Save salary" onPress={save} busy={saving} />
      </Sheet>
    </Screen>
  );
}
