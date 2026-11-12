import { useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, ErrorText, Field, Muted } from '../components/ui';
import { BASE_URL } from '../lib/api';
import { useAuth } from '../lib/auth';
import { colors, radius } from '../lib/theme';

// Resetting a password happens on the website: an emailed link opens a web page, so the same flow serves the app and the browser.
const openReset = (path: string) => { void Linking.openURL(`${BASE_URL}${path}`).catch(() => {}); };

export default function Login() {
  const { signIn } = useAuth();
  const insets = useSafeAreaInsets();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!identifier.trim() || !password) { setError('Enter your member code or email, and your password.'); return; }
    setBusy(true);
    setError(null);
    try {
      await signIn(identifier, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, paddingTop: insets.top + 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'flex-start', marginBottom: 32 }}>
          <LinearGradient colors={[colors.gradA, colors.gradB]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <Ionicons name="barbell" size={34} color={colors.gradInk} />
          </LinearGradient>
          <Text style={{ color: colors.ink, fontSize: 40, fontWeight: '800', letterSpacing: -1.5 }}>FitzyClub</Text>
          <Text style={{ color: colors.muted, fontSize: 16, marginTop: 4 }}>Train smarter. Run your gym better.</Text>
        </View>

        <View style={{ backgroundColor: colors.card, borderRadius: radius.xl, padding: 20, borderWidth: 1, borderColor: colors.line }}>
          <Field label="Member code or email" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" autoCorrect={false} returnKeyType="next" />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" onSubmitEditing={submit} returnKeyType="go" />
          <ErrorText>{error}</ErrorText>
          <View style={{ height: 8 }} />
          <Button title="Sign in" onPress={submit} busy={busy} />
        </View>

        <View style={{ marginTop: 20, gap: 10 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            <Muted>Forgot your password?</Muted>
            <Pressable onPress={() => openReset('/member/forgot-password')} accessibilityRole="link" hitSlop={8}><Text style={{ color: colors.link, fontWeight: '700', fontSize: 13 }}>Member</Text></Pressable>
            <Muted>or</Muted>
            <Pressable onPress={() => openReset('/forgot-password')} accessibilityRole="link" hitSlop={8}><Text style={{ color: colors.link, fontWeight: '700', fontSize: 13 }}>Staff</Text></Pressable>
          </View>
          <Muted>No login yet, or no email on file? Ask the front desk at your gym.</Muted>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
