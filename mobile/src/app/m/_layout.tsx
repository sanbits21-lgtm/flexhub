import { Stack } from 'expo-router';
import { colors } from '../../lib/theme';

// Pushed manager screens: native back button, dark header that melts into the page.
export default function ManagerStack() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.ink,
        headerTitleStyle: { fontWeight: '800', fontSize: 17 },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}
