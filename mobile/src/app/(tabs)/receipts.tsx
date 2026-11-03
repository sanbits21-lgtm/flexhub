import { Share, Text, View } from 'react-native';
import { Card, EmptyState, Loading, LoadError, Muted, Pill, Row, Screen } from '../../components/ui';
import { api, type PaymentRow } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { cap, fmtDate, rupees } from '../../lib/format';
import { useLoad } from '../../lib/hooks';
import { colors } from '../../lib/theme';

const TONE = { paid: 'success', pending: 'warn', failed: 'danger', refunded: 'neutral' } as const;

// The member's own payments. Shown only when the gym has switched on "Payment history in the member app".
export default function Receipts() {
  const { can } = useAuth();
  const { data, loading, error, reload } = useLoad(() => (can('features:memberPayments') ? api.get<PaymentRow[]>('/member-app/payments') : Promise.resolve([] as PaymentRow[])));

  if (!can('features:memberPayments')) {
    return <Screen title="Payments" subtitle="Your receipts"><Card><EmptyState icon="receipt-outline" title="Not turned on yet" text="Your gym has not enabled payment history. Ask the front desk for a receipt." /></Card></Screen>;
  }
  if (loading) return <Loading />;
  const rows = data ?? [];
  const paid = rows.filter((r) => r.status === 'paid').reduce((s, r) => s + r.amount, 0);

  const share = (p: PaymentRow) => Share.share({
    message: `Receipt ${p.invoiceNumber}\n${rupees(p.amount)} (${p.status}${p.method ? `, ${cap(p.method)}` : ''})\n${p.membershipPlanId?.name ?? 'Membership'}\n${fmtDate(p.paidAt ?? p.createdAt)}`,
  }).catch(() => {});

  return (
    <Screen title="Payments" subtitle="Your receipts" onRefresh={reload}>
      <LoadError message={error} onRetry={reload} />
      {rows.length > 0 && <Muted>You have paid {rupees(paid)} in total.</Muted>}
      {rows.length === 0 && !error && <Card><EmptyState icon="receipt-outline" title="No payments yet" text="Membership payments will show up here." /></Card>}
      {rows.length > 0 && (
        <Card style={{ paddingVertical: 4 }}>
          {rows.map((p, i) => (
            <Row key={p._id} icon="receipt" title={p.membershipPlanId?.name ?? 'Membership'} subtitle={`${fmtDate(p.paidAt ?? p.createdAt)} | ${p.method ? cap(p.method) : 'Payment'} | ${p.invoiceNumber}`}
              right={<View style={{ alignItems: 'flex-end', gap: 4 }}><Text style={{ color: p.status === 'refunded' ? colors.faint : colors.ink, fontWeight: '800', fontSize: 16, textDecorationLine: p.status === 'refunded' ? 'line-through' : 'none' }}>{rupees(p.amount)}</Text><Pill label={p.status} tone={TONE[p.status]} /></View>}
              onPress={() => share(p)} last={i === rows.length - 1} />
          ))}
        </Card>
      )}
      {rows.length > 0 && <Muted>Tap a payment to share its receipt.</Muted>}
    </Screen>
  );
}
