import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Banner, Button, Card, Choice, ErrorText, Muted } from './ui';
import { QrCode } from './QrCode';
import { api, type TenantSettings } from '../lib/api';
import { useAuth } from '../lib/auth';
import { rupees } from '../lib/format';
import { accountForBranch, buildUpiLink } from '../lib/upi';
import { colors } from '../lib/theme';

export type PayMethod = 'cash' | 'upi' | 'card' | 'netbanking' | 'other';
const ALL = [{ value: 'cash', label: 'Cash' }, { value: 'upi', label: 'UPI' }, { value: 'card', label: 'Card' }, { value: 'netbanking', label: 'Net banking' }, { value: 'other', label: 'Other' }] as const;

/**
 * Takes a payment at the front desk. Cash and the like are recorded straight away. UPI
 * shows a QR (amount pre-filled) and records only when staff confirm the money arrived,
 * or as "pending" if they walk away: there is no gateway to confirm it for them.
 * The caller decides what "record" means (renew, new member, plain payment).
 */
export function PaymentCollector({ amount, note, branchId, simple, allowLater = true, onRecord, ctaLabel = 'Collect' }: {
  amount: number;
  note?: string;
  /** The member's branch: it may collect into its own UPI account rather than the gym's. */
  branchId?: string;
  /** Only cash and UPI (renewals and sign-ups); otherwise every method. */
  simple?: boolean;
  /** Offer "collect later" for UPI. Off for renewals: that would extend a membership with nothing paid. */
  allowLater?: boolean;
  onRecord: (method: PayMethod, status: 'paid' | 'pending') => Promise<void>;
  ctaLabel?: string;
}) {
  const { can } = useAuth();
  const [method, setMethod] = useState<PayMethod>('cash');
  const [step, setStep] = useState<'choose' | 'upi'>('choose');
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { api.get<TenantSettings>('/tenant-settings').then(setSettings).catch(() => {}); }, []);
  const account = accountForBranch(settings, branchId);
  const upiOk = can('features:upiPayments') && !!account.upiId;
  const options = (simple ? ALL.filter((o) => o.value === 'cash' || o.value === 'upi') : ALL).filter((o) => o.value !== 'upi' || can('features:upiPayments'));

  const record = async (m: PayMethod, status: 'paid' | 'pending', tag: string) => {
    setBusy(tag);
    setError(null);
    try { await onRecord(m, status); } catch (e) { setError(e instanceof Error ? e.message : 'Could not record the payment.'); } finally { setBusy(null); }
  };

  if (step === 'upi' && settings && account.upiId) {
    const link = buildUpiLink({ upiId: account.upiId, payeeName: settings.name, amount, note });
    return (
      <Card style={{ alignItems: 'center', gap: 14 }}>
        <Text style={{ color: colors.muted, fontWeight: '700', fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase' }}>Ask the member to scan</Text>
        <Text style={{ color: colors.ink, fontSize: 36, fontWeight: '800', letterSpacing: -1 }}>{rupees(amount)}</Text>
        <QrCode value={link} size={230} />
        <Muted>{settings.name} | {account.upiId}</Muted>
        <ErrorText>{error}</ErrorText>
        <View style={{ alignSelf: 'stretch', gap: 10 }}>
          <Button title="Payment received" icon="checkmark" busy={busy === 'paid'} onPress={() => record('upi', 'paid', 'paid')} />
          {allowLater && <Button title="Collect later" kind="secondary" busy={busy === 'later'} onPress={() => record('upi', 'pending', 'later')} />}
          <Button title="Back" kind="ghost" small onPress={() => setStep('choose')} />
        </View>
      </Card>
    );
  }

  return (
    <Card style={{ gap: 4 }}>
      <Choice label="Payment method" value={method} options={options} onChange={setMethod} />
      {method === 'upi' && !upiOk && <Banner tone="warn">{!can('features:upiPayments') ? 'UPI is not enabled for your gym.' : 'Ask the gym owner to add a UPI ID under More, Payment settings.'}</Banner>}
      <ErrorText>{error}</ErrorText>
      <View style={{ height: 6 }} />
      {method === 'upi'
        ? <Button title="Show UPI QR" icon="qr-code" disabled={!upiOk} onPress={() => setStep('upi')} />
        : <Button title={`${ctaLabel} ${rupees(amount)}`} icon="checkmark" busy={busy === 'paid'} disabled={amount < 0} onPress={() => record(method, 'paid', 'paid')} />}
    </Card>
  );
}
