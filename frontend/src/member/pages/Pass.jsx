import { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { memberApi, errorText } from '../api';
import { useMemberAuth } from '../MemberAuth';
import { Banner, Card, EmptyState, ErrorText, Loading, Muted, Pill, Screen } from '../ui';

const REFRESH_BEFORE_MS = 25_000; // ask for a new pass well before the old one lapses

/**
 * The member's entry pass. The QR holds a short-lived signed token (two minutes), not a
 * permanent code, so a screenshot sent to a friend stops working almost immediately. The front
 * desk scans it; scanning someone already inside checks them out.
 */
export default function Pass() {
  const { can } = useMemberAuth();
  const enabled = can('features:qrCheckIn');
  const [pass, setPass] = useState(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const timer = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data } = await memberApi.get('/member-app/pass');
      setPass(data);
      setError('');
      const wait = Math.max(5_000, new Date(data.expiresAt).getTime() - Date.now() - REFRESH_BEFORE_MS);
      clearTimeout(timer.current);
      timer.current = setTimeout(load, wait);
    } catch (err) {
      setError(errorText(err, 'Could not load your pass.'));
      clearTimeout(timer.current);
      timer.current = setTimeout(load, 8_000); // keep trying: the gym may just have a weak signal
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    load();
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearTimeout(timer.current); document.removeEventListener('visibilitychange', onVisible); };
  }, [load, enabled]);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  // Keep the screen awake while the pass is open, so it does not dim at the front desk.
  useEffect(() => {
    let lock;
    const acquire = async () => { try { lock = await navigator.wakeLock?.request('screen'); } catch { /* not supported or refused */ } };
    if (enabled) acquire();
    const onVisible = () => { if (document.visibilityState === 'visible' && enabled) acquire(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { document.removeEventListener('visibilitychange', onVisible); lock?.release?.().catch(() => {}); };
  }, [enabled]);

  if (!enabled) {
    return <Screen title="My pass" subtitle="Front desk entry"><Card><EmptyState title="Not turned on yet" text="Your gym has not enabled the digital pass. Ask the front desk to check you in." /></Card></Screen>;
  }
  if (!pass && !error) return <Loading />;

  const secondsLeft = pass ? Math.max(0, Math.round((new Date(pass.expiresAt).getTime() - now) / 1000)) : 0;
  return (
    <Screen title="My pass" subtitle="Show at the front desk">
      <Card className="flex flex-col items-center gap-4 py-7">
        {pass && (
          <div className="rounded-2xl bg-white p-4 border border-gray-200" aria-label="Entry QR code">
            <QRCodeSVG value={pass.token} size={240} level="M" />
          </div>
        )}
        {pass && <p className="text-2xl font-extrabold text-gray-900 dark:text-gray-100">{pass.name}</p>}
        {pass && <Muted>{pass.memberCode}</Muted>}
        {pass && <Pill tone={secondsLeft > 15 ? 'success' : 'warn'}>{secondsLeft > 0 ? `Refreshes in ${secondsLeft}s` : 'Refreshing...'}</Pill>}
      </Card>
      <ErrorText>{error}</ErrorText>
      <Banner tone="info">This code changes every couple of minutes, so a screenshot will not work. Scanning it again when you leave checks you out.</Banner>
    </Screen>
  );
}
