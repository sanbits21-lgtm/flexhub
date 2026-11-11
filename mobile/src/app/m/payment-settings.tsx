import { useState } from 'react';
import { Text } from 'react-native';
import { Stack } from 'expo-router';
import { Banner, Button, Card, ErrorText, Field, Loading, Muted, Screen, Section } from '../../components/ui';
import { QrCode } from '../../components/QrCode';
import { api, type PaymentAccounts } from '../../lib/api';
import { useLoad } from '../../lib/hooks';
import { buildUpiLink } from '../../lib/upi';
import { colors } from '../../lib/theme';

const UPI_ID = /^[\w.\-_]{2,}@[a-zA-Z]{2,}$/;
type Account = { upiId: string; upiPaymentLink: string };

// One UPI account: an ID, an optional payment link, and a QR to test it with.
function AccountCard({ title, note, payeeName, initial, onSave, onClear }: {
  title: string; note: string; payeeName: string; initial: Account; onSave: (v: Account) => Promise<void>; onClear?: () => Promise<void>;
}) {
  const [upiId, setUpiId] = useState(initial.upiId);
  const [link, setLink] = useState(initial.upiPaymentLink);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = UPI_ID.test(upiId.trim());

  const run = async (fn: () => Promise<void>, after?: () => void) => {
    setBusy(true); setError(null); setSaved(false);
    try { await fn(); after?.(); setSaved(true); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); } finally { setBusy(false); }
  };

  return (
    <Card style={{ gap: 4 }}>
      <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '800' }}>{title}</Text>
      <Muted>{note}</Muted>
      <Field label="UPI ID" value={upiId} onChangeText={(v) => { setUpiId(v); setSaved(false); }} autoCapitalize="none" autoCorrect={false} placeholder="yourgym@okaxis" error={upiId && !valid ? 'This does not look like a UPI ID.' : null} />
      <Field label="Backup payment link (optional)" value={link} onChangeText={(v) => { setLink(v); setSaved(false); }} autoCapitalize="none" placeholder="https://..." />
      <ErrorText>{error}</ErrorText>
      {valid ? <QrCode value={buildUpiLink({ upiId: upiId.trim(), payeeName })} size={150} /> : null}
      <Button title={saved ? 'Saved' : 'Save'} icon={saved ? 'checkmark' : undefined} busy={busy} disabled={!!upiId && !valid} onPress={() => void run(() => onSave({ upiId: upiId.trim(), upiPaymentLink: link.trim() }))} />
      {onClear ? <Button title="Use the gym account" kind="secondary" disabled={busy} onPress={() => void run(onClear, () => { setUpiId(''); setLink(''); })} /> : null}
    </Card>
  );
}

// Owner only: the gym's default UPI account, and one per branch that banks separately.
export default function PaymentSettings() {
  const { data, loading, error, setData } = useLoad(() => api.get<PaymentAccounts>('/tenant-settings/payment-accounts'));
  if (loading && !data) return <Loading />;
  if (!data) return <Screen><ErrorText>{error}</ErrorText></Screen>;

  const saveDefault = async (v: Account) => {
    await api.put('/tenant-settings', v);
    setData({ ...data, default: v });
  };
  const saveBranch = (id: string) => async (v: Account) => {
    const b = await api.put<PaymentAccounts['branches'][number]>(`/tenant-settings/branches/${id}/payment`, v);
    setData({ ...data, branches: data.branches.map((x) => (x._id === id ? b : x)) });
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Payment settings' }} />
      <Banner tone="info">Members pay straight to your UPI ID: no gateway and no fees. A QR with the amount filled in appears when staff take a payment, and staff confirm once it arrives.</Banner>
      <AccountCard title="Gym account (default)" note="Used by every branch with no account of its own." payeeName={data.gymName} initial={data.default} onSave={saveDefault} />

      <Section title="Branch accounts" />
      <Muted>Does a branch bank separately? Give it its own UPI ID and its members' payments are collected there. Each payment records which account it was meant for.</Muted>
      {data.branches.map((b) => (
        <AccountCard
          key={b._id}
          title={b.name}
          note={b.usesDefault ? 'Uses the gym account.' : 'Collects into its own account.'}
          payeeName={data.gymName}
          initial={b}
          onSave={saveBranch(b._id)}
          onClear={b.usesDefault ? undefined : () => saveBranch(b._id)({ upiId: '', upiPaymentLink: '' })}
        />
      ))}
    </Screen>
  );
}
