import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { Banner, Button, Card, EmptyState, Field, H, Loading, Muted, Screen } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useBranch } from '../../lib/branch';
import { expiryText } from '../../lib/format';
import { colors, radius } from '../../lib/theme';

type ScanResult = { action: 'checked-in' | 'checked-out'; member: { name: string; memberCode: string; membershipStatus: string; membershipEnd?: string } };
type Outcome = { ok: boolean; title: string; detail: string } | null;

/**
 * Front-desk scanner. Point it at the QR on a member's pass: a member who is outside is
 * checked in, one who is inside is checked out. The server does all the checking (signature,
 * expiry, the right gym, membership status); this screen only reports what it decided.
 */
export default function Scan() {
  const { can } = useAuth();
  const { scoped } = useBranch();
  const [permission, requestPermission] = useCameraPermissions();
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState('');
  const last = useRef({ token: '', at: 0 });
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const submit = async (token: string) => {
    const now = Date.now();
    // The camera reports the same code many times a second; act on it once.
    if (busy || (token === last.current.token && now - last.current.at < 4000)) return;
    last.current = { token, at: now };
    setBusy(true);
    try {
      const r = await api.post<ScanResult>(scoped('/attendance/scan'), { token });
      const status = r.member.membershipEnd ? `Plan ends ${expiryText(r.member.membershipEnd)}` : '';
      setOutcome({ ok: true, title: `${r.member.name} ${r.action === 'checked-in' ? 'checked in' : 'checked out'}`, detail: [r.member.memberCode, status].filter(Boolean).join(' | ') });
    } catch (e) {
      setOutcome({ ok: false, title: 'Not checked in', detail: e instanceof Error ? e.message : 'Try again.' });
    } finally {
      setBusy(false);
      if (clearTimer.current) clearTimeout(clearTimer.current);
      clearTimer.current = setTimeout(() => setOutcome(null), 4000);
    }
  };

  if (!can('features:qrCheckIn')) {
    return <Screen><Stack.Screen options={{ title: 'Scan pass' }} /><Card><EmptyState icon="qr-code-outline" title="Not turned on for your gym" text="Ask your platform administrator to enable the QR member pass." /></Card></Screen>;
  }
  if (!permission) return <Loading />;

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Scan pass' }} />
      {!permission.granted ? (
        <Card style={{ gap: 12, alignItems: 'center' }}>
          <Ionicons name="camera-outline" size={40} color={colors.muted} />
          <H>Camera access needed</H>
          <Muted>The camera is only used to read the QR on a member's pass.</Muted>
          <Button title="Allow camera" icon="camera" onPress={requestPermission} />
        </Card>
      ) : (
        <View style={{ borderRadius: radius.xl, overflow: 'hidden', aspectRatio: 1, backgroundColor: '#000' }}>
          <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={({ data }) => { void submit(data); }} />
          <View pointerEvents="none" style={{ position: 'absolute', top: '15%', left: '15%', right: '15%', bottom: '15%', borderWidth: 3, borderColor: colors.accent, borderRadius: 24 }} />
        </View>
      )}

      {outcome ? (
        <Card style={{ flexDirection: 'row', gap: 14, alignItems: 'center', borderColor: outcome.ok ? colors.success : colors.danger }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: outcome.ok ? colors.successSoft : colors.dangerSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={outcome.ok ? 'checkmark' : 'close'} size={28} color={outcome.ok ? colors.success : colors.danger} />
          </View>
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="alert" style={{ color: colors.ink, fontSize: 17, fontWeight: '800' }}>{outcome.title}</Text>
            <Muted>{outcome.detail}</Muted>
          </View>
        </Card>
      ) : (
        <Banner tone="info">Hold the phone steady over the member's QR. Scanning someone who is inside checks them out.</Banner>
      )}

      <Card>
        <H>Camera not working?</H>
        <Field label="Pass code" hint="Only for when the camera is unavailable." value={manual} onChangeText={setManual} autoCapitalize="none" autoCorrect={false} placeholder="Paste the code" />
        <Button title="Check in with code" kind="secondary" disabled={manual.trim().length < 20} busy={busy} onPress={() => { void submit(manual.trim()); setManual(''); }} />
      </Card>
    </Screen>
  );
}
