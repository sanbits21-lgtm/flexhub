import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, isManagerRole, useAuth } from '../lib/auth';
import { BranchProvider } from '../lib/branch';
import { ThemeProvider, colors, isDark } from '../lib/theme';
import { Loading } from '../components/ui';

function Gate() {
  const { ready, role } = useAuth();
  if (!ready) return <Loading />;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={role !== null}>
        <Stack.Screen name="(tabs)" options={{ title: 'Home' }} />
      </Stack.Protected>
      {/* Manager-only screens. A member or trainer cannot navigate here even by URL. */}
      <Stack.Protected guard={isManagerRole(role)}>
        <Stack.Screen name="m" />
      </Stack.Protected>
      <Stack.Protected guard={role === null}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}

export default function Root() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BranchProvider>
          <StatusBar style={isDark() ? 'light' : 'dark'} />
          <Gate />
        </BranchProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
