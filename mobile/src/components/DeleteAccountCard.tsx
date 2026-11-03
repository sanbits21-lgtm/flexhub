import { useState } from 'react';
import { Linking } from 'react-native';
import { Button, Card, ErrorText, Field, H, Muted } from './ui';
import { BASE_URL, api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { confirmAction } from '../lib/dialog';

/**
 * In-app account deletion (required by Apple and Google). Asks for the password again so a
 * borrowed, unlocked phone cannot erase someone's account, and spells out what is kept.
 */
export function DeleteAccountCard() {
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    const ok = await confirmAction('Delete your account?', 'Your profile, photo, health details and saved plans are erased and cannot be recovered.', 'Delete');
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await api.delete('/member-app/me', { password });
      await signOut();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete your account.');
      setBusy(false);
    }
  };

  return (
    <Card>
      <H>Privacy</H>
      <Button title="Read the privacy policy" kind="ghost" icon="document-text-outline" onPress={() => { void Linking.openURL(`${BASE_URL}/privacy`); }} />
      {!open ? (
        <Button title="Delete my account" kind="danger" icon="trash-outline" onPress={() => setOpen(true)} />
      ) : (
        <>
          <Muted>This erases your name, phone, email, photo, health details and plans, cancels your upcoming sessions and signs you out. Your gym keeps its payment and attendance records, without your name.</Muted>
          <Field label="Enter your password to confirm" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
          <ErrorText>{error}</ErrorText>
          <Button title="Permanently delete my account" kind="danger" onPress={remove} busy={busy} disabled={!password} />
          <Button title="Cancel" kind="ghost" onPress={() => { setOpen(false); setPassword(''); setError(null); }} />
        </>
      )}
    </Card>
  );
}
