import { Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Avatar } from '../../components/Avatar';
import { Banner, Card, Hero, HomeSkeleton, LoadError, Muted, Pill, Row, Screen, Section, Stat, StatGrid } from '../../components/ui';
import ManagerHome from '../../screens/ManagerHome';
import { api, type MySessions, type Profile, type Summary } from '../../lib/api';
import { isManagerRole, useAuth } from '../../lib/auth';
import { cap, daysUntil, fmtDate } from '../../lib/format';
import { useLoad } from '../../lib/hooks';
import { colors } from '../../lib/theme';
import { dayKey, dayLabel, fmtRange } from '../../lib/time';

// One Home tab, three audiences: members, trainers (who have no home, only a schedule) and managers.
export default function Home() {
  const { role } = useAuth();
  if (role === 'trainer') return <Redirect href="/schedule" />;
  if (isManagerRole(role)) return <ManagerHome />;
  return <MemberHome />;
}

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};
function MemberHome() {
  const { can } = useAuth();
  const { data, error, loading, reload } = useLoad(async () => {
    const [profile, summary, sessions] = await Promise.all([
      api.get<Profile>('/member-app/me'),
      api.get<Summary>('/dashboard/summary'),
      api.get<MySessions>('/member-app/sessions').catch(() => null),
    ]);
    return { profile, summary, sessions };
  });

  if (loading) return <Screen title="Home" subtitle={greeting()}><HomeSkeleton /></Screen>;
  const profile = data?.profile;
  const summary = data?.summary;
  const left = daysUntil(summary?.membershipEnd);
  const expired = summary?.membershipStatus === 'expired' || (left !== null && left < 0);
  const incomplete = profile && (!profile.fitnessGoal || !profile.weightKg || !profile.heightCm);

  const now = Date.now();
  const next = [
    ...(data?.sessions?.training ?? []).filter((s) => s.status === 'scheduled' && new Date(s.startAt).getTime() > now).map((s) => ({ id: s._id, title: s.trainerName ? `Training with ${s.trainerName}` : 'Personal training', startAt: s.startAt, endAt: s.endAt })),
    ...(data?.sessions?.classes ?? []).map((c) => ({ id: c._id, title: c.name, startAt: c.startAt, endAt: c.endAt })),
  ].sort((a, b) => a.startAt.localeCompare(b.startAt))[0];

  return (
    <Screen title={profile ? profile.name.split(' ')[0] : 'Home'} subtitle={greeting()} onRefresh={reload}
      right={profile ? <Avatar memberId={profile._id} hasPhoto={profile.hasPhoto} name={profile.name} size={52} /> : undefined}>
      <LoadError message={error} onRetry={reload} />

      {summary && (
        <Hero
          label="Membership"
          value={expired ? 'Expired' : left === null ? 'No plan' : `${left} days`}
          caption={summary.membershipEnd ? `${expired ? 'Ended' : 'Renews'} ${fmtDate(summary.membershipEnd)}` : 'Ask the front desk to add a plan'}
        />
      )}

      <StatGrid>
        <Stat label="Visits this month" value={summary?.attendanceThisMonth ?? 0} />
        <Stat label="Status" value={cap(expired ? 'expired' : summary?.membershipStatus ?? '-')} tone={expired ? 'danger' : 'success'} hint={profile?.memberCode} />
      </StatGrid>

      {expired && <Banner tone="warn">Your membership has ended. Renew at the front desk to keep training.</Banner>}

      <Section title="Up next" />
      <Card>
        {next ? (
          <Row icon="calendar" tone="accent" title={next.title} subtitle={`${dayLabel(dayKey(next.startAt))}, ${fmtRange(next.startAt, next.endAt)}`} onPress={() => router.push('/sessions')} last />
        ) : (
          <Muted>Nothing booked. Your trainer or the front desk can schedule a session.</Muted>
        )}
      </Card>

      <Section title="Quick actions" />
      <Card>
        {can('features:qrCheckIn') && <Row icon="qr-code" tone="accent" title="My pass" subtitle="Show this at the front desk" onPress={() => router.push('/pass')} />}
        <Row icon="barbell" title="Today's workout" subtitle="See or make a workout plan" onPress={() => router.push('/workout')} />
        <Row icon="nutrition" title="Meal plan" subtitle="Calories and meals for your goal" onPress={() => router.push('/diet')} />
        <Row icon="stats-chart" title="Progress & badges" subtitle="Your weight, streaks and milestones" onPress={() => router.push('/progress')} />
        <Row icon="fitness" title="Trainers & equipment" subtitle={can('features:ratings') ? 'What your gym offers, and rate it' : 'What your gym offers'} onPress={() => router.push('/gym')} last={!can('features:memberPayments')} />
        {can('features:memberPayments') && <Row icon="receipt" title="Payment history" subtitle="Your receipts" onPress={() => router.push('/receipts')} last />}
      </Card>

      {incomplete && (
        <Card onPress={() => router.push('/profile')} style={{ borderColor: colors.accent }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 15 }}>Get plans that fit you</Text>
              <Muted>Add your goal, weight and height.</Muted>
            </View>
            <Pill label="2 min" tone="accent" />
          </View>
        </Card>
      )}
    </Screen>
  );
}
