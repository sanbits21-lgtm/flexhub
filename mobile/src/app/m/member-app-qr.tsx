import { useState } from 'react';
import { Share, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { QrCode } from '../../components/QrCode';
import { Banner, Body, Button, Card, ErrorText, Field, H, Loading, Muted, Screen } from '../../components/ui';
import { api, type MemberAppLink } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useLoad } from '../../lib/hooks';
import { colors } from '../../lib/theme';

const SOURCE = { gym: 'set by you', platform: 'set by FitzyClub for all gyms', automatic: 'the automatic address' } as const;

// The QR code members scan at the front desk to open the member app, instead of typing an address. It holds only the public address
// of the app: no member data, and it never expires. The owner can point it at their own address.
export default function MemberAppQr() {
  const { role } = useAuth();
  const owner = role === 'tenant-admin';
  const { data: link, loading, error, setData } = useLoad(() => api.get<MemberAppLink>('/tenant-settings/member-app-link'));
  const [custom, setCustom] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (loading && !link) return <Loading />;
  const shown = custom ?? link?.custom ?? '';

  const save = async (value: string) => {
    setSaving(true);
    setMsg(null);
    try {
      const next = await api.put<MemberAppLink>('/tenant-settings/member-app-link', { url: value.trim() });
      setData(next);
      setCustom(null);
      setMsg({ ok: true, text: value.trim() ? 'Saved. The QR code now points to your address.' : 'Back to the standard address. The QR code was updated.' });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not save the address.' });
    } finally { setSaving(false); }
  };

  const share = () => { if (link) void Share.share({ message: `Open ${link.gymName || 'our gym'} app: ${link.url}`, url: link.url }); };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Member app QR' }} />
      <ErrorText>{error}</ErrorText>
      {link && (
        <>
          <Card style={{ alignItems: 'center', gap: 14, paddingVertical: 22 }}>
            <H>{link.gymName || 'Your gym'}</H>
            <QrCode value={link.url} size={240} />
            <Text style={{ color: colors.ink, fontWeight: '700', textAlign: 'center' }} selectable>{link.url.replace(/^https?:\/\//, '')}</Text>
            <Muted>Members point their phone camera at this code to open the member app.</Muted>
          </Card>
          <Button title="Share the link" icon="share-outline" onPress={share} />
          <Banner tone="info">The code holds only the public address of the app: no member details, and it never expires. Address {SOURCE[link.source]}.</Banner>

          {owner && (
            <Card style={{ gap: 4 }}>
              <H>Use your own address</H>
              <Body>For example your own website page for the app. Leave it empty to use the standard address.</Body>
              <View style={{ height: 8 }} />
              <Field label="Address" value={shown} onChangeText={setCustom} autoCapitalize="none" keyboardType="url" placeholder={link.platform || link.automatic} />
              {msg ? <Banner tone={msg.ok ? 'success' : 'danger'}>{msg.text}</Banner> : null}
              <View style={{ gap: 10 }}>
                <Button title="Save address" onPress={() => { void save(shown); }} busy={saving} disabled={shown === (link.custom ?? '')} />
                {link.custom ? <Button title="Use the standard address" kind="secondary" onPress={() => { void save(''); }} disabled={saving} /> : null}
              </View>
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
