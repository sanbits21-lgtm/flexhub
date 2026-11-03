import { useMemo, useState } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Banner, Card, ErrorText, Field, Loading, Screen, Select } from '../../components/ui';
import { PaymentCollector } from '../../components/PaymentCollector';
import { Receipt, type ReceiptData } from '../../components/Receipt';
import { api, type MemberRow, type PlanRow } from '../../lib/api';
import { cap, fmtDate, rupees } from '../../lib/format';
import { useLoad } from '../../lib/hooks';

const planLabel = (p: PlanRow) => `${p.name} (${rupees(p.price)})`;

// Renew, change plan, or add a first plan: the server decides which from the member's current plan.
export default function Renew() {
  const { memberId } = useLocalSearchParams<{ memberId: string }>();
  const { data, loading, error } = useLoad(async () => {
    const [member, plans] = await Promise.all([api.get<MemberRow>(`/members/${memberId}`), api.get<PlanRow[]>('/membership-plans')]);
    return { member, plans: plans.filter((p) => p.isActive) };
  });
  const [planId, setPlanId] = useState<string | null>(null);
  const [discount, setDiscount] = useState('');
  const [amountText, setAmountText] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  const member = data?.member;
  const chosenId = planId ?? member?.membershipPlanId ?? '';
  const plan = data?.plans.find((p) => p._id === chosenId);
  const computed = useMemo(() => (plan ? Math.round(plan.price * (1 - (Number(discount) || 0) / 100)) : 0), [plan, discount]);
  const amount = amountText !== null ? Number(amountText) || 0 : computed;

  if (loading || !member) return error ? <Screen><ErrorText>{error}</ErrorText></Screen> : <Loading />;

  const hasPlan = !!member.membershipPlanId;
  const isChange = hasPlan && !!chosenId && chosenId !== member.membershipPlanId;
  const ended = member.membershipEnd ? new Date(member.membershipEnd) < new Date() : true;
  const title = !hasPlan ? 'Add plan' : isChange ? 'Change plan' : 'Renew';
  const current = data?.plans.find((p) => p._id === member.membershipPlanId)?.name;

  // Mirrors the server's rule so what is shown matches what will be saved.
  const note = !hasPlan ? 'No plan yet. The first term starts today.'
    : isChange ? `Switching from ${current ?? 'the current plan'} to ${plan?.name ?? 'the new plan'}. It starts today and any days left on the old plan do not carry over.`
    : ended ? `Ended on ${fmtDate(member.membershipEnd)}. The new term starts today.`
    : `Active until ${fmtDate(member.membershipEnd)}. Days left are kept, and the new term starts then.`;

  return (
    <Screen>
      <Stack.Screen options={{ title: `${title}: ${member.name}` }} />
      {receipt ? <Receipt r={receipt} onDone={() => router.back()} /> : (
        <>
          <Banner tone="info">{note}</Banner>
          <Card>
            <Select label="Plan" value={chosenId} placeholder="Choose a plan" onChange={(v) => { setPlanId(v); setAmountText(null); }} options={(data?.plans ?? []).map((p) => ({ value: p._id, label: planLabel(p), hint: cap(p.durationUnit) }))} />
            <Field label="Discount (%)" value={discount} onChangeText={(v) => { setDiscount(v.replace(/[^0-9.]/g, '')); setAmountText(null); }} keyboardType="decimal-pad" placeholder="0" />
            <Field label="Amount to collect (Rs)" value={amountText ?? String(computed)} onChangeText={(v) => setAmountText(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" hint={plan ? `List price ${rupees(plan.price)}` : undefined} />
          </Card>
          {plan ? (
            <PaymentCollector simple allowLater={false} amount={amount} note={`${title} ${plan.name}`} ctaLabel={title}
              onRecord={async (method) => {
                const res = await api.post<{ member: MemberRow; payment: { invoiceNumber: string; status: string } }>(`/members/${member._id}/renew`, { membershipPlanId: plan._id, amount, method });
                setReceipt({ title: `${title} done`, amount, status: res.payment.status, memberName: member.name, invoice: res.payment.invoiceNumber, method, planName: plan.name, validUntil: res.member.membershipEnd });
              }} />
          ) : <Banner tone="warn">Choose a plan to continue.</Banner>}
        </>
      )}
    </Screen>
  );
}
