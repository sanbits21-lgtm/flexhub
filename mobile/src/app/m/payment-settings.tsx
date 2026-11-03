import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { Stack } from 'expo-router';
import { Banner, Button, Card, ErrorText, Field, Loading, Muted, Screen } from '../../components/ui';
import { QrCode } from '../../components/QrCode';
import { api, type TenantSettings } from '../../lib/api';
import { buildUpiLink } from '../../lib/upi';
import { colors } from '../../lib/theme';

export default function PaymentSettings() {
  const [tenant, setTenant] = useState<TenantSettings | null>(null);
  const [upiId, setUpiId] = useState('');
  const [link, setLink] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { api.get<TenantSettings>('/tenant-settings').then((t) => { setTenant(t); setUpiId(t.upiId ?? ''); setLink(t.upiPaymentLink ?? ''); }).catch((e) => setError(e instanceof Error ? e.message : 'Could not load.')); }, []);

  const save = async () => {
    setSaving(true); setError(null); setSaved(false);
    try { const t = await api.put<TenantSettings>('/tenant-settings', { upiId: upiId.trim(), upiPaymentLink: link.trim() }); setTenant(t); setSaved(true); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); } finally { setSaving(false); }
  };

  if (!tenant) return error ? <Screen><ErrorText>{error}</ErrorText></Screen> : <Loading />;
  const valid = /^[\w.\-_]{2,}@[a-zA-Z]{2,}$/.test(upiId.trim());
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Payment settings' }} />
      <Banner tone="info">Members pay straight to your UPI ID: no gateway and no fees. A QR with the amount filled in appears when staff take a payment, and staff confirm once it arrives.</Banner>
      <Card>
        <Field label="UPI ID" value={upiId} onChangeText={(v) => { setUpiId(v); setSaved(false); }} autoCapitalize="none" autoCorrect={false} placeholder="yourgym@okaxis" error={upiId && !valid ? 'This does not look like a UPI ID.' : null} />
        <Field label="Backup payment link (optional)" value={link} onChangeText={(v) => { setLink(v); setSaved(false); }} autoCapitalize="none" placeholder="https://..." />
        <ErrorText>{error}</ErrorText>
        <Button title={saved ? 'Saved' : 'Save'} icon={saved ? 'checkmark' : undefined} onPress={save} busy={saving} disabled={!!upiId && !valid} />
      </Card>
      {valid && (
        <Card style={{ alignItems: 'center', gap: 12 }}>
          <Text style={{ color: colors.muted, fontWeight: '700', fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase' }}>Preview</Text>
          <QrCode value={buildUpiLink({ upiId: upiId.trim(), payeeName: tenant.name })} size={200} />
          <Muted>{tenant.name}. Scan with any UPI app to test.</Muted>
        </Card>
      )}
    </Screen>
  );
}
