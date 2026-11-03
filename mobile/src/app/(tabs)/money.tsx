import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { BranchBar } from '../../components/BranchBar';
import { Banner, Button, Card, Choice, EmptyState, Fab, ListSkeleton, LoadError, Muted, Pill, Row, Screen, Sheet } from '../../components/ui';
import { api, type PaymentRow } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useBranch } from '../../lib/branch';
import { confirmAction, say } from '../../lib/dialog';
import { cap, fmtDate, rupees } from '../../lib/format';
import { colors } from '../../lib/theme';

const FILTERS = [{ value: 'all', label: 'All' }, { value: 'paid', label: 'Paid' }, { value: 'pending', label: 'Pending' }, { value: 'refunded', label: 'Refunded' }] as const;
type Filter = (typeof FILTERS)[number]['value'];
const TONE = { paid: 'success', pending: 'warn', failed: 'danger', refunded: 'neutral' } as const;
const PAGE = 25;

export default function Money() {
  const { can } = useAuth();
  const { scoped, branchId } = useBranch();
  const [filter, setFilter] = useState<Filter>('all');
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<PaymentRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async (p: number, replace: boolean) => {
    setLoading(true);
    try {
      const qs = `page=${p}&limit=${PAGE}${filter === 'all' ? '' : `&status=${filter}`}`;
      const res = await api.get<{ payments: PaymentRow[]; total: number }>(scoped(`/payments?${qs}`));
      setRows((prev) => (replace ? res.payments : [...prev, ...res.payments]));
      setTotal(res.total);
      setPage(p);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load payments.');
    } finally {
      setLoading(false);
    }
  };
  useFocusEffect(useCallback(() => { void load(1, true); }, [filter, branchId]));

  const pending = rows.filter((r) => r.status === 'pending');
  const pendingSum = pending.reduce((s, r) => s + r.amount, 0);

  const update = async (p: PaymentRow, status: 'paid' | 'refunded') => {
    setBusy(true);
    try { await api.put(`/payments/${p._id}`, { status }); setOpen(null); await load(1, true); } catch (e) { say('Could not update', e instanceof Error ? e.message : 'Try again.'); } finally { setBusy(false); }
  };

  return (
    <Screen title="Payments" subtitle={`${total} ${filter === 'all' ? 'records' : filter}`} onRefresh={() => load(1, true)}
      fab={<Fab title="Record" icon="add" onPress={() => router.push('/m/payment-new')} />}>
      <BranchBar />
      <Choice value={filter} options={FILTERS} onChange={setFilter} />
      <LoadError message={error} onRetry={() => load(1, true)} />
      {pending.length > 0 && filter !== 'paid' && <Banner tone="warn">{pending.length} pending payment{pending.length === 1 ? '' : 's'} on this page, {rupees(pendingSum)} still to collect.</Banner>}

      {loading && rows.length === 0 && !error && <ListSkeleton />}
      {!loading && rows.length === 0 && !error && <Card><EmptyState icon="wallet-outline" title="No payments yet" text="Renewals and recorded payments show up here." /></Card>}
      <Card style={{ paddingVertical: 4 }}>
        {rows.map((p, i) => (
          <Row key={p._id} icon={p.status === 'paid' ? 'checkmark-circle' : p.status === 'pending' ? 'time' : 'return-down-back'} tone={TONE[p.status]}
            title={p.memberId?.name ?? 'Member'} subtitle={`${p.method ? cap(p.method) : 'Payment'} | ${fmtDate(p.paidAt ?? p.createdAt)}${p.membershipPlanId ? ` | ${p.membershipPlanId.name}` : ''}`}
            right={<View style={{ alignItems: 'flex-end', gap: 4 }}><Text style={{ color: p.status === 'refunded' ? colors.faint : colors.ink, fontWeight: '800', fontSize: 16, textDecorationLine: p.status === 'refunded' ? 'line-through' : 'none' }}>{rupees(p.amount)}</Text><Pill label={p.status} tone={TONE[p.status]} /></View>}
            onPress={() => setOpen(p)} last={i === rows.length - 1} />
        ))}
      </Card>
      {rows.length < total && <Button title={loading ? 'Loading...' : `Load more (${total - rows.length} left)`} kind="secondary" onPress={() => load(page + 1, false)} disabled={loading} />}
      <View style={{ height: 60 }} />

      <Sheet open={!!open} onClose={() => setOpen(null)} title={open ? rupees(open.amount) : ''}>
        {open && (
          <View style={{ gap: 12 }}>
            <Row title={open.memberId?.name ?? 'Member'} subtitle={open.memberId ? `${open.memberId.memberCode}${open.memberId.phone ? ` | ${open.memberId.phone}` : ''}` : ''} right={<Pill label={open.status} tone={TONE[open.status]} />} last />
            <Muted>Invoice {open.invoiceNumber} | {open.method ? cap(open.method) : 'No method'} | {fmtDate(open.paidAt ?? open.createdAt)}{open.membershipPlanId ? ` | ${open.membershipPlanId.name}` : ''}</Muted>
            {(open.status === 'pending' || open.status === 'failed') && <Button title="Mark as paid" icon="checkmark" busy={busy} onPress={() => update(open, 'paid')} />}
            {open.status === 'paid' && can('features:paymentRefunds') && (
              <Button title="Refund" kind="danger" busy={busy}
                onPress={async () => { if (await confirmAction(`Refund ${rupees(open.amount)}?`, 'This reverses the collection and removes it from revenue.', 'Refund')) await update(open, 'refunded'); }} />
            )}
            {open.memberId && <Button title="Open member" kind="secondary" onPress={() => { const id = open.memberId!._id; setOpen(null); router.push({ pathname: '/m/member/[id]', params: { id } }); }} />}
          </View>
        )}
      </Sheet>
    </Screen>
  );
}
