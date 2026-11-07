import { useState } from 'react';
import { memberApi } from '../api';
import { useMemberAuth } from '../MemberAuth';
import { useLoad } from '../useLoad';
import { Card, EmptyState, LoadState, Loading, Muted, Pill, Row, Screen } from '../ui';
import { cap, fmtDate, rupees } from '../format';

const TONE = { paid: 'success', pending: 'warn', failed: 'danger', refunded: 'neutral' };

// The member's own payments. Shown only when the gym has switched on "Payment history in the member app".
export default function Payments() {
  const { can } = useMemberAuth();
  const enabled = can('features:memberPayments');
  const { data, loading, error, stale, reload } = useLoad('payments', () => (enabled ? memberApi.get('/member-app/payments').then((r) => r.data) : Promise.resolve([])));
  const [note, setNote] = useState('');

  if (!enabled) {
    return <Screen title="Payments" subtitle="Your receipts"><Card><EmptyState title="Not turned on yet" text="Your gym has not enabled payment history. Ask the front desk for a receipt." /></Card></Screen>;
  }
  if (loading) return <Loading />;
  const rows = data ?? [];
  const paid = rows.filter((r) => r.status === 'paid').reduce((s, r) => s + r.amount, 0);

  const share = async (p) => {
    const text = `Receipt ${p.invoiceNumber}\n${rupees(p.amount)} (${p.status}${p.method ? `, ${cap(p.method)}` : ''})\n${p.membershipPlanId?.name ?? 'Membership'}\n${fmtDate(p.paidAt ?? p.createdAt)}`;
    try {
      if (navigator.share) await navigator.share({ title: `Receipt ${p.invoiceNumber}`, text });
      else { await navigator.clipboard.writeText(text); setNote('Receipt copied. Paste it into a message.'); }
    } catch { /* the share sheet was closed */ }
  };

  return (
    <Screen title="Payments" subtitle="Your receipts">
      <LoadState error={error} stale={stale} onRetry={reload} />
      {rows.length > 0 && <Muted>You have paid {rupees(paid)} in total.</Muted>}
      {rows.length === 0 && !error && <Card><EmptyState title="No payments yet" text="Membership payments will show up here." /></Card>}
      {rows.length > 0 && (
        <Card className="py-1">
          {rows.map((p, i) => (
            <Row
              key={p._id}
              title={p.membershipPlanId?.name ?? 'Membership'}
              subtitle={`${fmtDate(p.paidAt ?? p.createdAt)} | ${p.method ? cap(p.method) : 'Payment'} | ${p.invoiceNumber}`}
              right={(
                <span className="flex flex-col items-end gap-1">
                  <span className={`font-extrabold text-base ${p.status === 'refunded' ? 'text-gray-400 line-through' : 'text-gray-900 dark:text-gray-100'}`}>{rupees(p.amount)}</span>
                  <Pill tone={TONE[p.status]}>{p.status}</Pill>
                </span>
              )}
              onClick={() => share(p)}
              last={i === rows.length - 1}
            />
          ))}
        </Card>
      )}
      {rows.length > 0 && <Muted>Tap a payment to share its receipt.</Muted>}
      {note && <Muted role="status">{note}</Muted>}
    </Screen>
  );
}
