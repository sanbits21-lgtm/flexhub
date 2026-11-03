import type { ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../lib/theme';
import { isManagerRole, useAuth } from '../../lib/auth';

type Icon = keyof typeof Ionicons.glyphMap;
// Filled glyph when the tab is selected, outline when not.
const icon = (name: string) => ({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) => (
  <Ionicons name={(focused ? name : `${name}-outline`) as Icon} color={color as string} size={size} />
);

// One tab bar for every role. A tab a role should not see is hidden (`href: null`), not
// removed, so each screen keeps one stable URL whoever is signed in.
export default function TabsLayout() {
  const { role, can } = useAuth();
  const insets = useSafeAreaInsets();
  const manager = isManagerRole(role);
  const show = (visible: boolean) => ({ href: visible ? undefined : null });
  const member = role === 'member';
  const trainer = role === 'trainer';
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarActiveTintColor: colors.link,
        tabBarInactiveTintColor: colors.faint,
        // Six member tabs share 375px: a smaller label and no side padding keep "Sessions" and "My gym" whole.
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
        tabBarItemStyle: { paddingHorizontal: 0 },
        tabBarStyle: { backgroundColor: colors.tabBar, borderTopColor: colors.line, borderTopWidth: 1, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 10), height: 70 + Math.max(insets.bottom, 10) - 10 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home'), ...show(member || manager) }} />

      {/* member */}
      <Tabs.Screen name="sessions" options={{ title: 'Sessions', tabBarIcon: icon('calendar'), ...show(member) }} />
      <Tabs.Screen name="workout" options={{ title: 'Workout', tabBarIcon: icon('barbell'), ...show(member) }} />
      <Tabs.Screen name="diet" options={{ title: 'Diet', tabBarIcon: icon('nutrition'), ...show(member) }} />
      <Tabs.Screen name="gym" options={{ title: 'My gym', tabBarIcon: icon('fitness'), ...show(member) }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('person'), ...show(member) }} />

      {/* member screens reached from Home (feature-flagged), not from the tab bar */}
      {/* Hidden by removing the tab BUTTON, not with href:null: a screen hidden with href:null
          cannot be navigated to at all, so these would bounce straight back to Home. */}
      <Tabs.Screen name="pass" options={{ title: 'My pass', tabBarButton: () => null }} />
      <Tabs.Screen name="receipts" options={{ title: 'Payments', tabBarButton: () => null }} />

      {/* trainer */}
      <Tabs.Screen name="clients" options={{ title: 'Members', tabBarIcon: icon('people'), ...show(trainer) }} />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: icon('person-circle'), ...show(trainer) }} />

      {/* trainer and manager */}
      <Tabs.Screen name="schedule" options={{ title: 'Schedule', tabBarIcon: icon('calendar'), ...show((trainer || manager) && (can('features:personalTraining') || can('pages:classes'))) }} />

      {/* manager */}
      <Tabs.Screen name="people" options={{ title: 'Members', tabBarIcon: icon('people'), ...show(manager) }} />
      <Tabs.Screen name="money" options={{ title: 'Payments', tabBarIcon: icon('wallet'), ...show(manager) }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon('grid'), ...show(manager) }} />
    </Tabs>
  );
}
