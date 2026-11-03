import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Banner, Card, EmptyState, ErrorText, Loading, Muted, Pill, Screen } from '../../components/ui';
import { QrCode } from '../../components/QrCode';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { colors } from '../../lib/theme';

type Pass = { token: string; expiresAt: string; memberCode: string; name: string };
const REFRESH_BEFORE_MS = 25_000; // ask for a new pass well before the old one lapses

/**
 * The member's entry pass. The QR holds a short-lived signed token (two minutes), not a
 * permanent code, so a screenshot sent to a friend stops working almost immediately. The
 * front desk scans it; scanning someone already inside checks them out.
 */
export default function MyPass() {
  const { can } = useAuth();
  const [pass, setPass] = useState<Pass | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const p = await api.get<Pass>('/member-app/pass');
      setPass(p);
      setError(null);
      const wait = Math.max(5_000, new Date(p.expiresAt).getTime() - Date.now() - REFRESH_BEFORE_MS);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { void load(); }, wait);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your pass.');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { void load(); }, 8_000); // keep trying: the gym may just have a weak signal
    }
  }, []);

  useFocusEffect(useCallback(() => {
    if (!can('features:qrCheckIn')) return undefined;
    void load();
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [load, can]));

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  if (!can('features:qrCheckIn')) {
    return <Screen title="My pass" subtitle="Front desk entry"><Card><EmptyState icon="qr-code-outline" title="Not turned on yet" text="Your gym has not enabled the digital pass. Ask the front desk to check you in." /></Card></Screen>;
  }
  if (!pass && !error) return <Loading />;

  const secondsLeft = pass ? Math.max(0, Math.round((new Date(pass.expiresAt).getTime() - now) / 1000)) : 0;
  return (
    <Screen title="My pass" subtitle="Show at the front desk">
      <Card style={{ alignItems: 'center', gap: 16, paddingVertical: 28 }}>
        {pass && <QrCode value={pass.token} size={250} />}
        {pass && <Text style={{ color: colors.ink, fontSize: 22, fontWeight: '800' }}>{pass.name}</Text>}
        {pass && <Muted>{pass.memberCode}</Muted>}
        {pass && <Pill label={secondsLeft > 0 ? `Refreshes in ${secondsLeft}s` : 'Refreshing...'} tone={secondsLeft > 15 ? 'success' : 'warn'} />}
      </Card>
      <ErrorText>{error}</ErrorText>
      <Banner tone="info">This code changes every couple of minutes, so a screenshot will not work. Scanning it again when you leave checks you out.</Banner>
    </Screen>
  );
}
