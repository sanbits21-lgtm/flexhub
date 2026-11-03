import { AccountCard } from '../../components/AccountCard';
import { AppearanceCard } from '../../components/AppearanceCard';
import { Card, Initials, Muted, Screen } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { Text, View } from 'react-native';
import { colors } from '../../lib/theme';

export default function Account() {
  const { name } = useAuth();
  return (
    <Screen title="Account" subtitle="Trainer">
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Initials name={name} size={56} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '800' }}>{name}</Text>
          <Muted>Signed in as a trainer</Muted>
        </View>
      </Card>
      <AppearanceCard />
      <AccountCard />
    </Screen>
  );
}
