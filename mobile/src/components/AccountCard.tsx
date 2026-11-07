import { useState } from 'react';
import { Linking } from 'react-native';
import { Button, Card, ErrorText, Field, H, Muted } from './ui';
import { BASE_URL, api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { say } from '../lib/dialog';

/** Change password and sign out: the same for trainers and managers (staff accounts). */
export function AccountCard() {
  const { signOut, replaceToken } = useAuth();
  const [pw, setPw] = useState({ current: '', next: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ token?: string }>('/auth/change-password', { currentPassword: pw.current, newPassword: pw.next });
      if (r?.token) await replaceToken(r.token);
      setPw({ current: '', next: '' });
      say('Password changed', 'Use your new password next time you sign in.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card>
        <H>Change password</H>
        <Field label="Current password" value={pw.current} onChangeText={(v) => setPw((p) => ({ ...p, current: v }))} secureTextEntry autoCapitalize="none" />
        <Field label="New password" hint="At least 8 characters" value={pw.next} onChangeText={(v) => setPw((p) => ({ ...p, next: v }))} secureTextEntry autoCapitalize="none" />
        <ErrorText>{error}</ErrorText>
        <Button title="Change password" kind="secondary" onPress={change} busy={busy} disabled={!pw.current || pw.next.length < 8} />
      </Card>
      <Button title="Sign out" kind="danger" icon="log-out-outline" onPress={signOut} />
      <Button title="Privacy policy" kind="ghost" icon="document-text-outline" onPress={() => { void Linking.openURL(`${BASE_URL}/privacy`); }} />
      <Muted>Forgot your password? Ask your manager to reset it. Staff accounts are created and removed by your gym, so ask your manager to delete yours.</Muted>
    </>
  );
}
