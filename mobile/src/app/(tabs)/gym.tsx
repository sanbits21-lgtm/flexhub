import { Card, EmptyState, ErrorText, Initials, Loading, Muted, Pill, Row, Screen, Section } from '../../components/ui';
import { api, type Equipment, type Trainer } from '../../lib/api';
import { cap } from '../../lib/format';
import { useLoad } from '../../lib/hooks';
import { Text, View } from 'react-native';
import { colors } from '../../lib/theme';

export default function Gym() {
  const { data, loading, error, reload } = useLoad(async () => {
    // A gym can switch the equipment list off; that must not blank the trainers list.
    const [equipment, trainers] = await Promise.all([
      api.get<Equipment[]>('/member-app/equipment').catch(() => null),
      api.get<{ trainers: Trainer[]; assignedTrainerId: string | null }>('/member-app/trainers'),
    ]);
    return { equipment, ...trainers };
  });

  if (loading) return <Loading />;
  const byCategory = new Map<string, Equipment[]>();
  (data?.equipment ?? []).forEach((e) => { const k = e.category || 'Other'; byCategory.set(k, [...(byCategory.get(k) ?? []), e]); });

  return (
    <Screen title="My gym" subtitle="Trainers & equipment" onRefresh={reload}>
      <ErrorText>{error}</ErrorText>

      <Section title="Trainers" />
      <Card>
        {data?.trainers.length ? data.trainers.map((t, i) => (
          <View key={t._id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: i === data.trainers.length - 1 ? 0 : 1, borderBottomColor: colors.line }}>
            <Initials name={t.name} size={44} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 15 }}>{t.name}</Text>
              {t.specialization ? <Muted>{t.specialization}</Muted> : null}
            </View>
            {t._id === data.assignedTrainerId ? <Pill label="Your trainer" tone="accent" /> : null}
          </View>
        )) : <EmptyState icon="people-outline" title="No trainers listed yet" />}
      </Card>

      <Section title="Equipment" />
      {data?.equipment === null && <Card><Muted>Your gym has not turned on the equipment list.</Muted></Card>}
      {data?.equipment && data.equipment.length === 0 && <Card><EmptyState icon="barbell-outline" title="No equipment listed yet" /></Card>}
      {[...byCategory.entries()].map(([category, items]) => (
        <Card key={category}>
          <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 }}>{category}</Text>
          {items.map((e, i) => (
            <Row key={e._id} title={e.name} right={<Pill label={e.status === 'operational' ? 'Available' : cap(e.status)} tone={e.status === 'operational' ? 'success' : 'warn'} />} last={i === items.length - 1} />
          ))}
        </Card>
      ))}
    </Screen>
  );
}
