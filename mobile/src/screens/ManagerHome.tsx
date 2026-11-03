import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { BarChart, Card, Hero, HomeSkeleton, IconButton, LoadError, Muted, Pill, Row, Screen, Section, Stat, StatGrid, colors } from '../components/ui';
import { api, type ManagerSummary } from '../lib/api';
import { useAuth } from '../lib/auth';
import { BranchBar } from '../components/BranchBar';
import { useBranch } from '../lib/branch';
import { expiryText, rupees } from '../lib/format';
import { say } from '../lib/dialog';
import { useGymName } from '../lib/gym';
import { useLoad } from '../lib/hooks';
import { openWhatsApp, renewalMessage } from '../lib/whatsapp';

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

export default function ManagerHome() {
  const { name, role, can } = useAuth();
  const gym = useGymName();
  const { scoped, branchId, branchName, setBranchId } = useBranch();
  const { data, error, loading, reload } = useLoad(() => api.get<ManagerSummary>(scoped('/dashboard/summary')), [branchId]);

  const greet = `${greeting()}${role === 'branch-manager' ? '' : branchId ? ` | ${branchName(branchId)}` : ''}`;
  if (loading && !data) return <Screen title={name.split(' ')[0] || 'Home'} subtitle={greet}><HomeSkeleton /></Screen>;
  const s = data;
  const whatsapp = can('features:whatsappReminders');
  const remind = async (m: { name: string; phone: string; membershipEnd?: string }) => {
    const ok = await openWhatsApp(m.phone, renewalMessage({ name: m.name, gym, endsOn: m.membershipEnd })).catch(() => false);
    if (!ok) say('Cannot open WhatsApp', `${m.name}'s phone number does not look like one WhatsApp can use.`);
  };
  const expiring = s?.expiringSoonCount ?? s?.expiringSoon ?? 0;
  const expired = s?.expiredCount ?? 0;
  const checkins = s?.todaysCheckins;
  const renewals = [...(s?.expiredMembers ?? []).slice(0, 4).map((m) => ({ m, expired: true })), ...(s?.expiringSoonMembers ?? []).slice(0, 4).map((m) => ({ m, expired: false }))].slice(0, 5);

  return (
    <Screen title={name.split(' ')[0] || 'Home'} subtitle={greet} onRefresh={reload}>
      <BranchBar />
      <LoadError message={error} onRetry={reload} />

      <Hero label="Collected this month" value={rupees(s?.revenueThisMonth)} caption={s?.activeMembers !== undefined ? `${s.activeMembers} active members` : undefined} />

      <StatGrid>
        <Stat label="Expiring in 7 days" value={expiring} tone={expiring ? 'warn' : undefined} onPress={() => router.push({ pathname: '/people', params: { filter: 'expiring' } })} />
        <Stat label="Expired" value={expired} tone={expired ? 'danger' : undefined} onPress={() => router.push({ pathname: '/people', params: { filter: 'expired' } })} />
        {checkins !== undefined && <Stat label="Check-ins today" value={checkins} onPress={() => router.push('/m/attendance')} />}
        {s?.maintenanceDue !== undefined && <Stat label="Maintenance due" value={s.maintenanceDue} tone={s.maintenanceDue ? 'warn' : undefined} onPress={() => router.push('/m/equipment')} />}
        {s?.branchCount !== undefined && !branchId && <Stat label="Branches" value={s.branchCount} onPress={() => router.push('/m/branches')} />}
      </StatGrid>

      {can('features:qrCheckIn') && (
        <Card style={{ paddingVertical: 4 }}><Row icon="qr-code" tone="accent" title="Scan member pass" subtitle="Check members in or out at the front desk" onPress={() => router.push('/m/scan')} last /></Card>
      )}

      <Section title="Renewals to chase" action={<Pressable onPress={() => router.push({ pathname: '/people', params: { filter: 'expiring' } })} hitSlop={14} accessibilityRole="button" style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6 }}><Text style={{ color: colors.link, fontWeight: '700' }}>See all</Text></Pressable>} />
      <Card>
        {renewals.length === 0 ? <Muted>No one is expiring this week. Nice.</Muted> : renewals.map(({ m, expired: ex }, i) => (
          <Row key={m._id} title={m.name} subtitle={`${m.phone} | ${ex ? 'ended' : 'ends'} ${expiryText(m.membershipEnd)}`}
            right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Pill label={ex ? 'Expired' : 'Expiring'} tone={ex ? 'danger' : 'warn'} />{whatsapp && m.phone ? <IconButton icon="logo-whatsapp" label={`Remind ${m.name} on WhatsApp`} onPress={() => { void remind(m); }} /> : null}</View>}
            onPress={() => router.push({ pathname: '/m/member/[id]', params: { id: m._id } })} last={i === renewals.length - 1} />
        ))}
      </Card>

      {s?.collectionsByMonth && (
        <>
          <Section title="Collections, 6 months" />
          <Card><BarChart data={s.collectionsByMonth.map((c) => ({ label: c.month, value: c.amount }))} format={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} /></Card>
        </>
      )}
      {s?.membersByMonth && (
        <>
          <Section title="New members, 6 months" />
          <Card><BarChart color={colors.violet} data={s.membersByMonth.map((c) => ({ label: c.month, value: c.count }))} /></Card>
        </>
      )}
      {s?.attendanceTrend && s.attendanceTrend.length > 0 && (
        <>
          <Section title="Check-ins, last 7 days" />
          <Card><BarChart color={colors.info} data={s.attendanceTrend.map((c) => ({ label: c._id.slice(8), value: c.count }))} /></Card>
        </>
      )}

      {s?.perBranch && !branchId && s.perBranch.length > 0 && (
        <>
          <Section title="Branches" action={<Text style={{ color: colors.muted, fontSize: 12 }}>Tap one to open it</Text>} />
          <Card>
            {s.perBranch.map((b, i) => (
              <Row key={b.branchId} icon="storefront" title={b.branchName} subtitle={`${b.activeMembers} active | ${b.trainerCount} trainers | ${b.equipmentCount} equipment`}
                onPress={() => { setBranchId(b.branchId); }} last={i === s.perBranch!.length - 1} />
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}
