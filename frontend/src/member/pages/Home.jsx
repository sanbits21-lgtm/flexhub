import { Link } from 'react-router-dom';
import { memberApi } from '../api';
import { useMemberAuth } from '../MemberAuth';
import { useLoad } from '../useLoad';
import Avatar from '../Avatar';
import { Banner, Card, Hero, Icon, ICONS, LoadState, Loading, Muted, Pill, Row, Screen, Section, Stat } from '../ui';
import { cap, dayKey, dayLabel, daysUntil, fmtDate, fmtRange } from '../format';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

export default function Home() {
  const { can } = useMemberAuth();
  const { data, error, stale, loading, reload } = useLoad('home', async () => {
    const [profile, summary, sessions] = await Promise.all([
      memberApi.get('/member-app/me').then((r) => r.data),
      memberApi.get('/dashboard/summary').then((r) => r.data),
      memberApi.get('/member-app/sessions').then((r) => r.data).catch(() => null),
    ]);
    return { profile, summary, sessions };
  });

  if (loading) return <Loading />;
  const { profile, summary, sessions } = data || {};
  const left = daysUntil(summary?.membershipEnd);
  const expired = summary?.membershipStatus === 'expired' || (left !== null && left < 0);
  const incomplete = profile && (!profile.fitnessGoal || !profile.weightKg || !profile.heightCm);

  const now = Date.now();
  const next = [
    ...(sessions?.training ?? []).filter((s) => s.status === 'scheduled' && new Date(s.startAt).getTime() > now)
      .map((s) => ({ id: s._id, title: s.trainerName ? `Training with ${s.trainerName}` : 'Personal training', startAt: s.startAt, endAt: s.endAt })),
    ...(sessions?.classes ?? []).map((c) => ({ id: c._id, title: c.name, startAt: c.startAt, endAt: c.endAt })),
  ].sort((a, b) => a.startAt.localeCompare(b.startAt))[0];

  return (
    <Screen
      title={profile ? profile.name.split(' ')[0] : 'Home'}
      subtitle={greeting()}
      right={profile ? <Avatar memberId={profile._id} hasPhoto={profile.hasPhoto} name={profile.name} size={52} /> : null}
    >
      <LoadState error={error} stale={stale} onRetry={reload} />

      {summary && (
        <Hero
          label="Membership"
          value={expired ? 'Expired' : left === null ? 'No plan' : `${left} days`}
          caption={summary.membershipEnd ? `${expired ? 'Ended' : 'Renews'} ${fmtDate(summary.membershipEnd)}` : 'Ask the front desk to add a plan'}
        />
      )}

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Visits this month" value={summary?.attendanceThisMonth ?? 0} />
        <Stat label="Status" value={cap(expired ? 'expired' : summary?.membershipStatus ?? '-')} tone={expired ? 'danger' : 'success'} hint={profile?.memberCode} />
      </div>

      {expired && <Banner tone="warn">Your membership has ended. Renew at the front desk to keep training.</Banner>}

      <Section title="Up next" />
      <Card>
        {next ? (
          <Row to="/member/sessions" last icon={<Icon d={ICONS.calendar} />} title={next.title} subtitle={`${dayLabel(dayKey(next.startAt))}, ${fmtRange(next.startAt, next.endAt)}`} />
        ) : (
          <Muted>Nothing booked. Your trainer or the front desk can schedule a session.</Muted>
        )}
      </Card>

      <Section title="Quick actions" />
      <Card className="py-1">
        {can('features:qrCheckIn') && <Row to="/member/pass" icon={<Icon d={ICONS.qr} />} title="My pass" subtitle="Show this at the front desk" />}
        <Row to="/member/workout" icon={<Icon d={ICONS.barbell} />} title="Today's workout" subtitle="See or make a workout plan" />
        <Row to="/member/diet" icon={<Icon d={ICONS.nutrition} />} title="Meal plan" subtitle="Calories and meals for your goal" />
        <Row to="/member/gym" icon={<Icon d={ICONS.gym} />} title="Trainers & equipment" subtitle="What your gym offers" last={!can('features:memberPayments')} />
        {can('features:memberPayments') && <Row to="/member/payments" icon={<Icon d={ICONS.receipt} />} title="Payment history" subtitle="Your receipts" last />}
      </Card>

      {incomplete && (
        <Link to="/member/profile" className="block">
          <Card className="border-2 border-accent flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-bold text-gray-900 dark:text-gray-100">Get plans that fit you</p>
              <Muted>Add your goal, weight and height.</Muted>
            </div>
            <Pill tone="accent">2 min</Pill>
          </Card>
        </Link>
      )}
    </Screen>
  );
}
