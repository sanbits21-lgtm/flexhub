import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Choice, EmptyState, ErrorText, Loading, Muted, Pill, Screen } from './ui';
import { api, type StoredPlan } from '../lib/api';
import { fmtDate } from '../lib/format';
import { useLoad } from '../lib/hooks';
import { colors } from '../lib/theme';

type Plans = {
  workout: StoredPlan<unknown>; diet: StoredPlan<unknown>;
  assignedWorkout: StoredPlan<unknown>; assignedDiet: StoredPlan<unknown>;
};
type Base = { title: string; summary?: string; disclaimer: string };

// Shared by the Workout and Diet tabs. Two sections: the plan a trainer or the branch
// manager wrote for this member (shown first, it is the one to follow), and the plan the
// member generates themselves. `render` draws a plan body.
export function PlanShell<T extends Base>({ type, title, noun, extra, render }: {
  type: 'workout' | 'diet';
  title: string;
  noun: string;
  extra?: { days: number; setDays: (n: number) => void } | null;
  render: (plan: T) => ReactNode;
}) {
  const { data, loading, error, reload, setData } = useLoad(() => api.get<Plans>('/member-app/plans'));
  const [busy, setBusy] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  if (loading) return <Loading />;
  const stored = (data?.[type] ?? null) as StoredPlan<T>;
  const assigned = (data?.[type === 'workout' ? 'assignedWorkout' : 'assignedDiet'] ?? null) as StoredPlan<T>;

  const generate = async () => {
    setBusy(true);
    setGenError(null);
    try {
      const res = await api.post<NonNullable<StoredPlan<T>>>('/member-app/plans/generate', { type, daysPerWeek: extra?.days });
      setData({
        workout: data?.workout ?? null, diet: data?.diet ?? null,
        assignedWorkout: data?.assignedWorkout ?? null, assignedDiet: data?.assignedDiet ?? null,
        [type]: res,
      });
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Could not create a plan.');
    } finally {
      setBusy(false);
    }
  };

  const view = (plan: NonNullable<StoredPlan<T>>, pill: ReactNode) => (
    <>
      <Card style={{ gap: 8 }}>
        {pill}
        <Text style={{ fontSize: 22, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 }}>{plan.content.title}</Text>
        {plan.content.summary ? <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 20 }}>{plan.content.summary}</Text> : null}
      </Card>
      {render(plan.content)}
      <Muted>{plan.content.disclaimer}</Muted>
    </>
  );

  return (
    <Screen title={title} subtitle={assigned ? 'From your trainer' : 'Made for you'} onRefresh={reload}>
      <ErrorText>{error}</ErrorText>

      {assigned && view(assigned, <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Pill label={assigned.createdByName || 'Your trainer'} tone="accent" /><Muted>{fmtDate(assigned.createdAt)}</Muted></View>)}

      <Card style={{ gap: 12 }}>
        <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 16 }}>{assigned ? 'Or make your own' : `Your ${noun}`}</Text>
        {extra && (
          <Choice label="Days per week" value={String(extra.days) as '3'} options={['1', '2', '3', '4', '5'].map((n) => ({ value: n as '3', label: n }))} onChange={(v) => extra.setDays(Number(v))} />
        )}
        <ErrorText>{genError}</ErrorText>
        <Button title={stored ? `Make a new ${noun}` : `Make my ${noun}`} onPress={generate} busy={busy} kind={assigned ? 'secondary' : 'primary'} icon="sparkles" />
        <Muted>Uses your profile and the equipment at your gym.</Muted>
        <Button title="Update my profile" kind="ghost" small onPress={() => router.push('/profile')} />
      </Card>

      {stored
        ? view(stored, <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Pill label={stored.source === 'ai' ? 'Written by AI' : 'Built-in plan'} tone="info" /><Muted>{fmtDate(stored.createdAt)}</Muted></View>)
        : !busy && !assigned && <Card><EmptyState icon="sparkles-outline" title={`No ${noun} yet`} text="Tap the button above to make one." /></Card>}
    </Screen>
  );
}
