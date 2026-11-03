import { useEffect, useState } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Card, Field, Screen, Select } from '../../components/ui';
import { PaymentCollector } from '../../components/PaymentCollector';
import { Receipt, type ReceiptData } from '../../components/Receipt';
import { api, type MemberRow, type PaymentRow, type PlanRow } from '../../lib/api';
import { useBranch } from '../../lib/branch';
import { rupees } from '../../lib/format';

// A one-off payment (a top-up, a locker fee…) recorded against a member, outside a renewal.
export default function PaymentNew() {
  const params = useLocalSearchParams<{ memberId?: string }>();
  const { scoped } = useBranch();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [memberId, setMemberId] = useState(params.memberId ?? '');
  const [planId, setPlanId] = useState('');
  const [amount, setAmount] = useState('');
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  useEffect(() => {
    api.get<{ members: MemberRow[] }>(scoped('/members?limit=200')).then((r) => setMembers(r.members)).catch(() => {});
    api.get<PlanRow[]>('/membership-plans').then((r) => setPlans(r.filter((p) => p.isActive))).catch(() => {});
  }, []);

  const member = members.find((m) => m._id === memberId);
  const plan = plans.find((p) => p._id === planId);
  const value = Number(amount) || 0;

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Record payment' }} />
      {receipt ? <Receipt r={receipt} onDone={() => router.back()} /> : (
        <>
          <Card>
            <Select label="Member" value={memberId} searchable placeholder="Choose a member" onChange={(v) => setMemberId(v)} options={members.map((m) => ({ value: m._id, label: m.name, hint: m.memberCode }))} />
            <Select label="For plan (optional)" value={planId} placeholder="No plan" clearLabel="No plan" onChange={(v) => { setPlanId(v); const p = plans.find((x) => x._id === v); if (p) setAmount(String(p.price)); }} options={plans.map((p) => ({ value: p._id, label: `${p.name} (${rupees(p.price)})` }))} />
            <Field label="Amount (Rs)" value={amount} onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="0" />
          </Card>
          {memberId && value > 0 ? (
            <PaymentCollector amount={value} note={plan?.name} ctaLabel="Record"
              onRecord={async (method, status) => {
                const p = await api.post<PaymentRow>('/payments', { memberId, membershipPlanId: planId || undefined, amount: value, method, status });
                setReceipt({ title: status === 'paid' ? 'Payment recorded' : 'Saved as pending', amount: value, status: p.status, memberName: member?.name ?? 'Member', invoice: p.invoiceNumber, method, planName: plan?.name });
              }} />
          ) : null}
        </>
      )}
    </Screen>
  );
}
