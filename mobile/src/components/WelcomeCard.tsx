import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { api, type MemberRow } from '../lib/api';
import { fmtDate } from '../lib/format';
import { colors } from '../lib/theme';
import { openWhatsAppTo, welcomeText, type WelcomeAccess } from '../lib/welcomeCard';
import { QrCode } from './QrCode';
import { Banner, Button } from './ui';

// The card is always dark with the gym's accent colour, whatever the app theme is, so the picture sent on WhatsApp looks the same
// for every member.
const INK = '#0b0e05';

/**
 * A new member's welcome card: who they are, how to sign in (username and a one-time password) and the member app's address
 * with a QR code. It can be opened in WhatsApp as a ready message to the member, or shared as a picture.
 */
export function WelcomeCard({ gymName, member, access, planName, onDone }: { gymName: string; member: Pick<MemberRow, 'name' | 'phone' | 'membershipEnd'>; access: WelcomeAccess; planName?: string; onDone: () => void }) {
  const [appUrl, setAppUrl] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shot = useRef<ComponentRef<typeof View>>(null);
  const validUntil = member.membershipEnd ? fmtDate(member.membershipEnd) : '';

  useEffect(() => {
    let live = true;
    api.get<{ url: string }>('/tenant-settings/member-app-link').then((r) => { if (live) setAppUrl(r.url); }).catch(() => { if (live) setNote('Could not load the member app address. Try again from the member screen.'); });
    return () => { live = false; };
  }, []);

  const text = welcomeText({ gymName, memberName: member.name, access, appUrl, planName, validUntil });

  const whatsapp = async () => {
    setNote(null);
    const ok = await openWhatsAppTo(member.phone, text).catch(() => false);
    if (!ok) setNote("This phone number does not look like one WhatsApp can use. Share the card as a picture instead.");
  };

  const sharePicture = async () => {
    setNote(null);
    setBusy(true);
    try {
      const uri = shot.current ? await captureRef(shot, { format: 'png', quality: 1 }) : null;
      if (uri &&(await Sharing.isAvailableAsync())) await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Send the welcome card' });
      else setNote('Sharing a picture is not available on this device.');
    } catch {
      setNote('Could not make the picture. Use "Open in WhatsApp" instead.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <View ref={shot} collapsable={false}>
        <View style={{ backgroundColor: INK, borderRadius: 24, padding: 20, gap: 14 }}>
          <View>
            <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 }}>MEMBER APP ACCESS</Text>
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 4 }} numberOfLines={2}>{gymName || 'Your gym'}</Text>
          </View>
          <View>
            <Text style={{ color: 'rgba(255,255,255,.7)', fontSize: 13 }}>Welcome,</Text>
            <Text style={{ color: '#fff', fontSize: 26, fontWeight: '800' }} numberOfLines={2}>{member.name}</Text>
            {planName ? <Text style={{ color: 'rgba(255,255,255,.6)', fontSize: 13, marginTop: 2 }}>{planName}{validUntil ? `  ·  valid until ${validUntil}` : ''}</Text> : null}
          </View>
          <View style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.accent, backgroundColor: 'rgba(255,255,255,.07)', padding: 14, gap: 10 }}>
            <View>
              <Text style={{ color: 'rgba(255,255,255,.6)', fontSize: 11, fontWeight: '600', letterSpacing: 0.5 }}>USERNAME (MEMBER CODE)</Text>
              <Text selectable style={{ color: colors.accent, fontSize: 22, fontWeight: '800', fontFamily: 'monospace' }}>{access.memberCode}</Text>
            </View>
            <View>
              <Text style={{ color: 'rgba(255,255,255,.6)', fontSize: 11, fontWeight: '600', letterSpacing: 0.5 }}>PASSWORD</Text>
              <Text selectable style={{ color: '#fff', fontSize: 22, fontWeight: '800', fontFamily: 'monospace' }}>{access.password}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: 'rgba(255,255,255,.6)', fontSize: 11, fontWeight: '600', letterSpacing: 0.5 }}>OPEN THE MEMBER APP</Text>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>{appUrl.replace(/^https?:\/\//, '') || '...'}</Text>
              <Text style={{ color: 'rgba(255,255,255,.5)', fontSize: 11, marginTop: 4 }}>Sign in, then add it to your home screen.</Text>
            </View>
            {appUrl ? <QrCode value={appUrl} size={92} /> : null}
          </View>
        </View>
      </View>

      <Banner tone="info">The password is shown only now and is not emailed. The member can change it after signing in.</Banner>
      {note ? <Banner tone="danger">{note}</Banner> : null}
      <Button title="Open in WhatsApp" icon="logo-whatsapp" onPress={() => { void whatsapp(); }} disabled={!appUrl} />
      <Button title="Share card as picture" icon="share-outline" kind="secondary" busy={busy} onPress={() => { void sharePicture(); }} disabled={!appUrl} />
      <Button title="Done" kind="ghost" onPress={onDone} />
    </View>
  );
}
