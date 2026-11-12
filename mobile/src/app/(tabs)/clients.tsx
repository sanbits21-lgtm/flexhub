import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, EmptyState, ErrorText, Field, Initials, Loading, Muted, Pill, Screen } from '../../components/ui';
import { api, type TrainerMember } from '../../lib/api';
import { useLoad } from '../../lib/hooks';
import { colors } from '../../lib/theme';

const TONE = { active: 'success', expired: 'danger', frozen: 'warn', cancelled: 'danger' } as const;

// The trainer's assigned members. (Named "clients" in the URL because the member app already owns /profile etc.)
export default function Clients() {
  const { data, loading, error, reload } = useLoad(() => api.get<{ members: TrainerMember[] }>('/members?limit=200'));
  const [search, setSearch] = useState('');
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.members ?? []).filter((m) => !q || m.name.toLowerCase().includes(q) || m.memberCode.toLowerCase().includes(q));
  }, [data, search]);

  if (loading) return <Loading />;
  return (
    <Screen title="Members" subtitle={`${data?.members.length ?? 0} assigned to you`} onRefresh={reload}>
      <ErrorText>{error}</ErrorText>
      <Field label="Search" value={search} onChangeText={setSearch} placeholder="Name or member code" autoCapitalize="none" />
      {list.length === 0 && <Card><EmptyState icon="people-outline" title={data?.members.length ? 'No match' : 'No members yet'} text={data?.members.length ? undefined : 'Ask your branch manager to assign members to you.'} /></Card>}
      {list.map((m) => (
        <Card key={m._id} style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Initials name={m.name} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 16 }}>{m.name}</Text>
              <Muted>{m.memberCode}{m.phone ? ` | ${m.phone}` : ''}</Muted>
            </View>
            <Pill label={m.membershipStatus} tone={TONE[m.membershipStatus as keyof typeof TONE] ?? 'neutral'} />
          </View>
          <Button title="Schedule a session" kind="secondary" small icon="calendar" onPress={() => router.push({ pathname: '/schedule', params: { memberId: m._id } })} />
        </Card>
      ))}
      <Muted>Workout and diet plans are written on the FitzyClub website for now.</Muted>
    </Screen>
  );
}
