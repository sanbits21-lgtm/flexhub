import { useState } from 'react';
import { Stack, router } from 'expo-router';
import { Banner, Button, Card, EmptyState, ErrorText, Loading, Pill, Row, Screen, Section, Select } from '../../components/ui';
import { api, type AttendanceRow, type MemberRow } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useBranch } from '../../lib/branch';
import { say } from '../../lib/dialog';
import { fmtDateTime } from '../../lib/format';
import { useLoad } from '../../lib/hooks';

export default function Attendance() {
  const { role, can } = useAuth();
  const { scoped, branchId } = useBranch();
  const { data, loading, error, reload } = useLoad(async () => {
    const [records, members] = await Promise.all([
      api.get<AttendanceRow[]>(scoped('/attendance?limit=60')),
      api.get<{ members: MemberRow[] }>(scoped('/members?limit=200&membershipStatus=active')),
    ]);
    return { records, members: members.members };
  }, [branchId]);
  const [memberId, setMemberId] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  // Attendance is recorded per branch, so a tenant admin must pick one first.
  const needsBranch = role === 'tenant-admin' && !branchId;
  const act = async (tag: string, fn: () => Promise<unknown>) => {
    setBusy(tag);
    try { await fn(); await reload(); } catch (e) { say('Could not update', e instanceof Error ? e.message : 'Try again.'); } finally { setBusy(null); }
  };

  if (loading && !data) return <Loading />;
  const records = data?.records ?? [];
  // A check-in with no check-out after 12 hours is a forgotten one, not someone still training
  // (the server applies the same rule when deciding whether a member is "already inside").
  const STALE_MS = 12 * 60 * 60 * 1000;
  const inside = records.filter((r) => !r.checkOutAt && Date.now() - new Date(r.checkInAt).getTime() < STALE_MS);

  return (
    <Screen onRefresh={reload}>
      <Stack.Screen options={{ title: 'Attendance' }} />
      <ErrorText>{error}</ErrorText>
      {needsBranch && <Banner tone="warn">Pick a branch on the Home tab to record attendance.</Banner>}
      {can('features:qrCheckIn') && <Button title="Scan member pass" icon="qr-code" onPress={() => router.push('/m/scan')} />}
      <Card>
        <Select label="Check a member in" value={memberId} searchable placeholder="Choose a member" onChange={(v) => setMemberId(v)} options={(data?.members ?? []).map((m) => ({ value: m._id, label: m.name, hint: m.memberCode }))} />
        <Button title="Check in" icon="finger-print" disabled={!memberId || needsBranch} busy={busy === 'in'} onPress={() => act('in', async () => { await api.post(scoped('/attendance/check-in'), { memberId }); setMemberId(''); })} />
      </Card>

      <Section title={`Inside now (${inside.length})`} />
      <Card style={{ paddingVertical: 4 }}>
        {inside.length === 0 && <EmptyState icon="footsteps-outline" title="No one is checked in" />}
        {inside.map((r, i) => (
          <Row key={r._id} icon="person" tone="success" title={r.memberId?.name ?? 'Member'} subtitle={`In ${fmtDateTime(r.checkInAt)}`}
            right={<Button title="Check out" small kind="secondary" busy={busy === r._id} onPress={() => act(r._id, () => api.post('/attendance/check-out', { attendanceId: r._id }))} />} last={i === inside.length - 1} />
        ))}
      </Card>

      <Section title="Recent" />
      <Card style={{ paddingVertical: 4 }}>
        {records.filter((r) => !inside.includes(r)).slice(0, 25).map((r, i, arr) => (
          <Row key={r._id} title={r.memberId?.name ?? 'Member'} subtitle={r.checkOutAt ? `${fmtDateTime(r.checkInAt)} to ${fmtDateTime(r.checkOutAt)}` : `${fmtDateTime(r.checkInAt)} (no check-out recorded)`} right={<Pill label={r.method} tone="neutral" />} last={i === arr.length - 1} />
        ))}
      </Card>
    </Screen>
  );
}
