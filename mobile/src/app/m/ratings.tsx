import { Stack } from 'expo-router';
import { Text, View } from 'react-native';
import { Banner, Card, EmptyState, ErrorText, Loading, Muted, Screen, Section } from '../../components/ui';
import { Stars } from '../../components/RatingStars';
import { api, type RatingRow, type StaffRatings } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import { useLoad } from '../../lib/hooks';
import { colors } from '../../lib/theme';

function Distribution({ counts }: { counts: number[] }) {
  const max = Math.max(1, ...counts);
  return (
    <View style={{ gap: 4 }}>
      {[5, 4, 3, 2, 1].map((n) => (
        <View key={n} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: colors.muted, fontSize: 12, width: 10 }}>{n}</Text>
          <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.surface2 }}><View style={{ height: 8, borderRadius: 4, backgroundColor: '#F5A623', width: `${((counts[n - 1] ?? 0) / max) * 100}%` }} /></View>
          <Text style={{ color: colors.muted, fontSize: 12, width: 24, textAlign: 'right' }}>{counts[n - 1]}</Text>
        </View>
      ))}
    </View>
  );
}

function Score({ title, subtitle, row }: { title: string; subtitle?: string; row: RatingRow }) {
  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '800' }} numberOfLines={1}>{title}</Text>
          {subtitle ? <Muted>{subtitle}</Muted> : null}
        </View>
        {row.count > 0 && row.average !== null ? (
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <Text style={{ color: colors.ink, fontSize: 26, fontWeight: '800' }}>{row.average}</Text>
            <Stars value={row.average} size={15} />
          </View>
        ) : <Muted>No ratings yet</Muted>}
      </View>
      {row.count > 0 ? (
        <>
          <Muted>{row.count} rating{row.count === 1 ? '' : 's'}</Muted>
          <Distribution counts={row.distribution} />
          {row.recent.map((r, i) => (
            <View key={`${r.at}-${i}`} style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Stars value={r.stars} size={14} /><Muted>{fmtDate(r.at)}</Muted></View>
              <Text style={{ color: colors.ink, fontSize: 14, lineHeight: 20 }}>{r.comment}</Text>
            </View>
          ))}
        </>
      ) : null}
    </Card>
  );
}

// Owners and branch managers: what members think of the gym and of each trainer.
export default function Ratings() {
  const { data, loading, error, reload } = useLoad(() => api.get<StaffRatings>('/ratings'));
  if (loading && !data) return <Loading />;
  return (
    <Screen onRefresh={reload}>
      <Stack.Screen options={{ title: 'Ratings' }} />
      <ErrorText>{error}</ErrorText>
      {data ? (
        <>
          <Banner>Comments are anonymous. Members see only the gym's average, once {data.minPublic} have rated. Trainer scores are for owners and branch managers only.</Banner>
          <Section title="Gym" />
          {data.gym.map((g) => <Score key={g.branchId} title={g.branchName} row={g} />)}
          <Section title="Trainers" />
          {data.trainers.length === 0 ? <Card><EmptyState icon="people-outline" title="No trainers yet" /></Card> : null}
          {data.trainers.map((t) => <Score key={t.trainerId} title={t.name} subtitle={[t.specialization, t.branchName].filter(Boolean).join(' - ')} row={t} />)}
        </>
      ) : null}
    </Screen>
  );
}
