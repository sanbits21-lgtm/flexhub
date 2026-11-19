import { useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { BranchBar } from '../../components/BranchBar';
import { DateField } from '../../components/DateFields';
import { Banner, Button, Card, EmptyState, ErrorText, Fab, Field, IconButton, Loading, Muted, Pill, Row, Screen, Section, Select, Sheet, Stat, StatGrid, Body } from '../../components/ui';
import { api, type ExpenseRow, type ExpenseSummary } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useBranch } from '../../lib/branch';
import { confirmAction } from '../../lib/dialog';
import { cap, fmtDate, rupees } from '../../lib/format';
import { useLoad } from '../../lib/hooks';
import { dateInput } from '../../lib/time';

const CATEGORIES = [
  { value: 'salary-trainer', label: 'Trainer salary', salary: true },
  { value: 'salary-manager', label: 'Manager salary', salary: true },
  { value: 'salary-other', label: 'Other staff salary', salary: true },
  { value: 'maintenance', label: 'Maintenance & repairs' },
  { value: 'rent', label: 'Rent' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'equipment', label: 'Equipment purchase' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'other', label: 'Other' },
] as const;
const METHODS = [{ value: 'cash', label: 'Cash' }, { value: 'upi', label: 'UPI' }, { value: 'bank', label: 'Bank transfer' }, { value: 'cheque', label: 'Cheque' }, { value: 'other', label: 'Other' }] as const;
const label = (value: string) => CATEGORIES.find((c) => c.value === value)?.label ?? cap(value);
const blank = { category: 'maintenance', amount: '', date: dateInput(new Date()), paidTo: '', method: 'cash', note: '', branchId: '' };

const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const monthEnd = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const monthLabel = (d: Date) => d.toLocaleDateString([], { month: 'long', year: 'numeric' });

// What the gym spends, by month: money out against money collected, and the list behind it. The owner sees everything including
// salaries; a branch manager sees their own branch and never salaries.
export default function Expenses() {
  const { role } = useAuth();
  const admin = role === 'tenant-admin';
  const { scoped, branchId, branches, branchName } = useBranch();
  const [month, setMonth] = useState(monthStart(new Date()));
  const from = dateInput(month);
  const to = dateInput(monthEnd(month));
  const { data, loading, error, reload } = useLoad(async () => {
    const [list, summary] = await Promise.all([
      api.get<{ items: ExpenseRow[]; truncated: boolean }>(scoped(`/expenses?from=${from}&to=${to}`)),
      api.get<ExpenseSummary>(scoped(`/expenses/summary?from=${from}&to=${to}`)),
    ]);
    return { list, summary };
  }, [branchId, from]);
  const [edit, setEdit] = useState<{ id?: string; row?: ExpenseRow } | null>(null);
  const [f, setF] = useState({ ...blank });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) => setF((s) => ({ ...s, [k]: v }));
  const categories = CATEGORIES.filter((c) => admin || !('salary' in c && c.salary));

  const shift = (by: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + by, 1));
  const openNew = () => { setF({ ...blank, date: dateInput(new Date()) }); setErr(null); setEdit({}); };
  const openEdit = (e: ExpenseRow) => {
    setF({ category: e.category, amount: String(e.amount), date: e.date.slice(0, 10), paidTo: e.paidTo ?? '', method: e.method, note: e.note ?? '', branchId: e.branchId ?? '' });
    setErr(null);
    setEdit({ id: e._id, row: e });
  };

  const save = async () => {
    setErr(null);
    const amount = Number(f.amount);
    if (!Number.isFinite(amount) || amount <= 0) { setErr('Enter the amount spent.'); return; }
    if (!f.date) { setErr('Choose the date.'); return; }
    setSaving(true);
    try {
      const body = { category: f.category, amount, date: f.date, paidTo: f.paidTo.trim(), method: f.method, note: f.note.trim() };
      if (edit?.id) await api.put(`/expenses/${edit.id}`, body);
      else await api.post(scoped('/expenses'), { ...body, ...(admin ? { branchId: branchId || f.branchId || undefined } : {}) });
      setEdit(null);
      await reload();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save.'); } finally { setSaving(false); }
  };

  const voidIt = async () => {
    if (!edit?.id || !(await confirmAction('Void this expense?', 'It stays in the history, marked voided, and no longer counts in the totals.', 'Void'))) return;
    setSaving(true);
    try { await api.post(`/expenses/${edit.id}/void`, {}); setEdit(null); await reload(); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not void.'); } finally { setSaving(false); }
  };

  if (loading && !data) return <Loading />;
  const items = data?.list.items ?? [];
  const sum = data?.summary;
  const payroll = !!edit?.row?.payrollKey;
  const voided = !!edit?.row?.voided;

  return (
    <Screen fab={<Fab title="Add" onPress={openNew} />} onRefresh={reload}>
      <Stack.Screen options={{ title: 'Expenses' }} />
      <BranchBar />
      <ErrorText>{error}</ErrorText>

      <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }}>
        <IconButton icon="chevron-back" label="Previous month" onPress={() => shift(-1)} />
        <Body style={{ fontWeight: '800' }}>{monthLabel(month)}</Body>
        <IconButton icon="chevron-forward" label="Next month" onPress={() => shift(1)} />
      </Card>

      {sum && (
        <StatGrid>
          <Stat label="Spent" value={rupees(sum.totalExpenses)} tone="danger" />
          <Stat label="Collected" value={rupees(sum.collected)} tone="success" />
          {sum.net !== null && <Stat label="Left over" value={rupees(sum.net)} tone={sum.net >= 0 ? 'success' : 'danger'} hint="collected minus spent" />}
        </StatGrid>
      )}
      {sum?.partial && <Banner tone="info">Salaries are not shown to branch managers, so these totals leave them out.</Banner>}
      {data?.list.truncated && <Banner tone="warn">Only the latest 500 expenses are listed. Narrow the month to see the rest.</Banner>}

      {sum && sum.byCategory.length > 0 && (
        <>
          <Section title="Where it went" />
          <Card style={{ paddingVertical: 4 }}>
            {sum.byCategory.map((c, i) => <Row key={c.category} icon="pie-chart" title={label(c.category)} right={<Body style={{ fontWeight: '700' }}>{rupees(c.total)}</Body>} last={i === sum.byCategory.length - 1} />)}
          </Card>
        </>
      )}

      <Section title={`Expenses (${items.length})`} />
      {items.length === 0 ? (
        <Card><EmptyState icon="wallet-outline" title="No expenses this month" text="Tap Add to record rent, repairs, utilities and the rest." /></Card>
      ) : (
        <Card style={{ paddingVertical: 4 }}>
          {items.map((e, i) => (
            <Row key={e._id} icon={e.voided ? 'close-circle' : 'receipt'} tone={e.voided ? 'warn' : undefined}
              title={`${label(e.category)}${e.paidTo ? `: ${e.paidTo}` : ''}`}
              subtitle={[fmtDate(e.date), cap(e.method), admin && !branchId && e.branchId ? branchName(e.branchId) : '', e.note].filter(Boolean).join(' | ')}
              right={e.voided ? <Pill label="Voided" tone="warn" /> : <Body style={{ fontWeight: '700' }}>{rupees(e.amount)}</Body>}
              onPress={() => openEdit(e)} last={i === items.length - 1} />
          ))}
        </Card>
      )}
      <View style={{ height: 70 }} />

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? (payroll ? 'Payroll row' : 'Edit expense') : 'Add expense'}>
        {payroll && <Banner tone="info">This row came from a payroll run. Void it and run payroll again to change it (on the website).</Banner>}
        {voided && <Banner tone="warn">This expense was voided{edit?.row?.voidReason ? `: ${edit.row.voidReason}` : ''}. It no longer counts.</Banner>}
        <Select label="Category" value={f.category} onChange={(v) => set('category', v)} options={categories.map((c) => ({ value: c.value, label: c.label }))} />
        <Field label="Amount (Rs)" value={f.amount} onChangeText={(v) => set('amount', v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" editable={!payroll && !voided} />
        <DateField label="Date" value={f.date} onChange={(v) => set('date', v)} maximumDate={new Date(Date.now() + 30 * 86400000)} />
        <Field label="Paid to (optional)" value={f.paidTo} onChangeText={(v) => set('paidTo', v)} editable={!payroll && !voided} />
        <Select label="Paid by" value={f.method} onChange={(v) => set('method', v)} options={METHODS.map((m) => ({ value: m.value, label: m.label }))} />
        {admin && !branchId && !edit?.id && <Select label="Branch (optional)" value={f.branchId} placeholder="The whole gym" clearLabel="The whole gym" onChange={(v) => set('branchId', v)} options={branches.map((b) => ({ value: b._id, label: b.name }))} />}
        <Field label="Note (optional)" value={f.note} onChangeText={(v) => set('note', v)} multiline maxLength={300} editable={!payroll && !voided} />
        <ErrorText>{err}</ErrorText>
        <View style={{ gap: 10, marginTop: 6 }}>
          {!payroll && !voided && <Button title="Save" onPress={save} busy={saving} />}
          {edit?.id && !voided && <Button title="Void expense" kind="danger" onPress={voidIt} disabled={saving} />}
          {(payroll || voided) && <Muted>Nothing else can be changed here.</Muted>}
        </View>
      </Sheet>
    </Screen>
  );
}
