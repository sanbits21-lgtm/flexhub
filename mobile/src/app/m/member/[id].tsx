import { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Banner, Button, Card, EmptyState, ErrorText, H, Initials, Loading, Muted, Pill, Row, Screen, Section, Sheet } from '../../../components/ui';
import { api, type AttendanceRow, type MemberRow, type PaymentRow, type PlanRow, type StaffRow } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useBranch } from '../../../lib/branch';
import { confirmAction, say } from '../../../lib/dialog';
import { useGymName } from '../../../lib/gym';
import { openWhatsApp, renewalMessage } from '../../../lib/whatsapp';
import { cap, expiryText, fmtDate, fmtDateTime, rupees } from '../../../lib/format';
import { useLoad } from '../../../lib/hooks';
import { colors } from '../../../lib/theme';

const TONE = { active: 'success', expired: 'danger', frozen: 'warn', cancelled: 'danger' } as const;
const PAY_TONE = { paid: 'success', pending: 'warn', failed: 'danger', refunded: 'neutral' } as const;

export default function MemberDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can } = useAuth();
  const gym = useGymName();
  const { scoped } = useBranch();
  const { data, loading, error, reload } = useLoad(async () => {
    const [member, plans, trainers, payments, visits] = await Promise.all([
      api.get<MemberRow>(`/members/${id}`),
      api.get<PlanRow[]>('/membership-plans').catch(() => [] as PlanRow[]),
      api.get<StaffRow[]>(scoped('/staff?role=trainer')).catch(() => [] as StaffRow[]),
      api.get<PaymentRow[]>(`/payments/member/${id}`).catch(() => [] as PaymentRow[]),
      can('pages:attendance') ? api.get<AttendanceRow[]>(`/attendance/member/${id}`).catch(() => [] as AttendanceRow[]) : Promise.resolve([] as AttendanceRow[]),
    ]);
    return { member, plans, trainers, payments, visits };
  }, [id]);
  const [busy, setBusy] = useState<string | null>(null);
  const [creds, setCreds] = useState<{ memberCode: string; email: string | null; password: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading || !data) return error ? <Screen><ErrorText>{error}</ErrorText></Screen> : <Loading />;
  const { member: m, plans, trainers, payments, visits } = data;
  const plan = plans.find((p) => p._id === m.membershipPlanId);
  const trainer = trainers.find((t) => t._id === m.assignedTrainerId);
  const status = m.isActive ? m.membershipStatus : null;

  const run = async (tag: string, fn: () => Promise<unknown>, after?: () => Promise<void> | void) => {
    setBusy(tag); setActionError(null);
    try { await fn(); await (after ? after() : reload()); } catch (e) { setActionError(e instanceof Error ? e.message : 'That did not work.'); } finally { setBusy(null); }
  };

  const remind = async () => {
    const ok = await openWhatsApp(m.phone, renewalMessage({ name: m.name, gym, planName: plan?.name, endsOn: m.membershipEnd })).catch(() => false);
    if (!ok) say('Cannot open WhatsApp', 'This phone number does not look like one WhatsApp can use.');
  };
  const checkIn = () => run('checkin', () => api.post(scoped('/attendance/check-in'), { memberId: m._id }), async () => { await reload(); say('Checked in', `${m.name} is checked in.`); });
  const appAccess = () => run('access', async () => setCreds(await api.post(`/members/${m._id}/app-access`)), () => {});
  const deactivate = async () => {
    if (!(await confirmAction(`Deactivate ${m.name}?`, 'They disappear from lists, counts and renewal chases. You can reactivate them later.', 'Deactivate'))) return;
    await run('deactivate', () => api.delete(`/members/${m._id}`), () => router.back());
  };
  const reactivate = () => run('reactivate', () => api.put(`/members/${m._id}`, { isActive: true }));

  return (
    <Screen onRefresh={reload}>
      <Stack.Screen options={{ title: '' }} />
      <Card style={{ alignItems: 'center', gap: 8, paddingVertical: 24 }}>
        <Initials name={m.name} size={72} />
        <Text style={{ color: colors.ink, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 }}>{m.name}</Text>
        <Muted>{m.memberCode}</Muted>
        <View>{status ? <Pill label={status} tone={TONE[status]} /> : <Pill label="Deactivated" tone="neutral" />}</View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
          <Button title="Call" small kind="secondary" icon="call" onPress={() => Linking.openURL(`tel:${m.phone}`)} />
          {m.email ? <Button title="Email" small kind="secondary" icon="mail" onPress={() => Linking.openURL(`mailto:${m.email}`)} /> : null}
        </View>
      </Card>

      {!m.isActive && <Banner tone="warn">This member is deactivated and hidden from lists.</Banner>}
      <ErrorText>{actionError}</ErrorText>

      <Card>
        <H>Membership</H>
        <Row icon="pricetag" title={plan?.name ?? 'No plan'} subtitle={plan ? `${cap(plan.durationUnit)} | ${rupees(plan.price)}` : 'Add a plan to start their membership'} />
        <Row icon="calendar" title={m.membershipEnd ? `${m.membershipStatus === 'expired' ? 'Ended' : 'Ends'} ${fmtDate(m.membershipEnd)}` : 'No end date'} subtitle={m.membershipEnd ? `${expiryText(m.membershipEnd)}${m.membershipStart ? ` | started ${fmtDate(m.membershipStart)}` : ''}` : undefined} last />
        <View style={{ height: 8 }} />
        <Button title={!m.membershipPlanId ? 'Add plan' : 'Renew or change plan'} icon="refresh" disabled={!m.isActive} onPress={() => router.push({ pathname: '/m/renew', params: { memberId: m._id } })} />
      </Card>

      <Section title="Actions" />
      <Card style={{ gap: 10 }}>
        {can('pages:attendance') && <Button title="Check in now" icon="finger-print" kind="secondary" busy={busy === 'checkin'} disabled={!m.isActive} onPress={checkIn} />}
        {can('features:whatsappReminders') && <Button title="Remind on WhatsApp" icon="logo-whatsapp" kind="secondary" onPress={() => { void remind(); }} />}
        <Button title="Record a payment" icon="cash" kind="secondary" disabled={!m.isActive} onPress={() => router.push({ pathname: '/m/payment-new', params: { memberId: m._id } })} />
        <Button title="Edit details" icon="create" kind="secondary" onPress={() => router.push({ pathname: '/m/member-form', params: { id: m._id } })} />
        <Button title="App login / reset password" icon="key" kind="secondary" busy={busy === 'access'} disabled={!m.isActive} onPress={appAccess} />
        {m.isActive
          ? <Button title="Deactivate" icon="close-circle" kind="danger" busy={busy === 'deactivate'} onPress={deactivate} />
          : <Button title="Reactivate" icon="checkmark-circle" busy={busy === 'reactivate'} onPress={reactivate} />}
      </Card>

      <Card>
        <H>Details</H>
        <Row icon="call" title={m.phone} subtitle="Phone" />
        {m.email ? <Row icon="mail" title={m.email} subtitle="Email" /> : null}
        <Row icon="person" title={trainer?.name ?? 'No trainer assigned'} subtitle="Trainer" />
        {m.emergencyContact?.name || m.emergencyContact?.phone ? <Row icon="medkit" title={[m.emergencyContact?.name, m.emergencyContact?.phone].filter(Boolean).join(' | ')} subtitle="Emergency contact" last /> : <Row icon="medkit" title="Not provided" subtitle="Emergency contact" last />}
      </Card>

      <Section title="Payments" />
      <Card style={{ paddingVertical: 4 }}>
        {payments.length === 0 && <EmptyState icon="wallet-outline" title="No payments yet" />}
        {payments.slice(0, 6).map((p, i, arr) => (
          <Row key={p._id} title={rupees(p.amount)} subtitle={`${p.method ? cap(p.method) : 'Payment'} | ${fmtDate(p.paidAt ?? p.createdAt)} | ${p.invoiceNumber}`} right={<Pill label={p.status} tone={PAY_TONE[p.status]} />} last={i === arr.length - 1} />
        ))}
      </Card>

      {can('pages:attendance') && (
        <>
          <Section title="Recent visits" />
          <Card style={{ paddingVertical: 4 }}>
            {visits.length === 0 && <EmptyState icon="footsteps-outline" title="No visits yet" />}
            {visits.slice(0, 5).map((v, i, arr) => <Row key={v._id} title={fmtDateTime(v.checkInAt)} subtitle={v.checkOutAt ? `Out ${fmtDateTime(v.checkOutAt)}` : 'Still inside'} last={i === arr.length - 1} />)}
          </Card>
        </>
      )}

      <Sheet open={!!creds} onClose={() => setCreds(null)} title="App login">
        {creds && (
          <View style={{ gap: 12 }}>
            <Banner tone="info">Give these to {m.name}. The password is shown once. Any password they had stops working and they are signed out of the app.</Banner>
            <Row title={creds.memberCode} subtitle="Member code" />
            {creds.email ? <Row title={creds.email} subtitle="Or sign in with email" /> : null}
            <Row title={creds.password} subtitle="Temporary password" last />
            <Button title="Done" onPress={() => setCreds(null)} />
          </View>
        )}
      </Sheet>
    </Screen>
  );
}
