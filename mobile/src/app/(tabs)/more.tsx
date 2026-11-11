import { router } from 'expo-router';
import { AccountCard } from '../../components/AccountCard';
import { AppearanceCard } from '../../components/AppearanceCard';
import { Card, Initials, Muted, Row, Screen, Section } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { Text, View } from 'react-native';
import { colors } from '../../lib/theme';

// Everything that is not a daily tab. Tenant-admin items are hidden for branch managers,
// and any feature the gym has switched off is hidden for everyone.
export default function More() {
  const { role, name, can } = useAuth();
  const admin = role === 'tenant-admin';
  const go = (p: string) => () => router.push(p as never);

  return (
    <Screen title="More" subtitle={admin ? 'Gym owner' : 'Branch manager'}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Initials name={name} size={52} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '800' }}>{name}</Text>
          <Muted>{admin ? 'Tenant admin' : 'Branch manager'}</Muted>
        </View>
      </Card>

      <Section title="Run the gym" />
      <Card style={{ paddingVertical: 4 }}>
        {can('features:qrCheckIn') && <Row icon="qr-code" title="Scan member pass" subtitle="QR check-in at the front desk" onPress={go('/m/scan')} />}
        {can('pages:attendance') && <Row icon="finger-print" title="Attendance" subtitle="Check members in and out" onPress={go('/m/attendance')} />}
        <Row icon="people-circle" title="Trainers" subtitle="Add, edit and reset passwords" onPress={go('/m/trainers')} />
        {can('features:ratings') && <Row icon="star" title="Ratings" subtitle="What members think of the gym and trainers" onPress={go('/m/ratings')} />}
        {can('pages:equipment') && <Row icon="barbell" title="Equipment" subtitle="Inventory and maintenance" onPress={go('/m/equipment')} />}
        {can('pages:classes') && <Row icon="albums" title="Class types" subtitle="Yoga, Zumba and other group classes" onPress={go('/m/class-types')} />}
        <Row icon="pricetags" title="Membership plans" subtitle={admin ? 'Prices and durations' : 'What members can buy'} onPress={go('/m/plans')} last />
      </Card>

      {admin && (
        <>
          <Section title="Business" />
          <Card style={{ paddingVertical: 4 }}>
            <Row icon="storefront" title="Branches" subtitle="Locations and branch managers" onPress={go('/m/branches')} />
            {can('pages:reports') && <Row icon="stats-chart" title="Reports" subtitle="Plan mix, attendance, equipment health" onPress={go('/m/reports')} />}
            {can('pages:trainerReport') && <Row icon="cash" title="Trainer collections & salary" onPress={go('/m/trainer-report')} />}
            {can('pages:paymentSettings') && <Row icon="qr-code" title="Payment settings" subtitle="Your UPI ID" onPress={go('/m/payment-settings')} last />}
          </Card>
        </>
      )}

      <Section title="Account" />
      <AppearanceCard />
      <AccountCard />
    </Screen>
  );
}
