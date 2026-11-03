import { View } from 'react-native';
import { Stack } from 'expo-router';
import { BarChart, Card, EmptyState, ErrorText, Loading, Muted, Row, Screen, Section, Stat, StatGrid, colors } from '../../components/ui';
import { BranchBar } from '../../components/BranchBar';
import { api, type ReportSummary } from '../../lib/api';
import { useBranch } from '../../lib/branch';
import { cap, fmtDate, rupees } from '../../lib/format';
import { useLoad } from '../../lib/hooks';

const STATUS_TONE = { operational: 'success', under_maintenance: 'warn', retired: undefined } as const;

export default function Reports() {
  const { scoped, branchId, branchName } = useBranch();
  const { data, loading, error, reload } = useLoad(() => api.get<ReportSummary>(scoped('/reports/summary')), [branchId]);

  if (loading && !data) return <Loading />;
  const d = data;
  const trend = (d?.attendanceTrend ?? []).slice(-14);
  return (
    <Screen onRefresh={reload}>
      <Stack.Screen options={{ title: 'Reports' }} />
      <BranchBar />
      <ErrorText>{error}</ErrorText>

      <Section title="Active members by plan" />
      <Card style={{ gap: 14 }}>
        {(d?.planMix ?? []).length === 0 ? <EmptyState icon="stats-chart-outline" title="No active members yet" /> : (
          <>
            <BarChart color={colors.violet} data={(d?.planMix ?? []).map((p) => ({ label: p.planName.slice(0, 8), value: p.activeMembers }))} />
            {(d?.planMix ?? []).map((p, i, arr) => <Row key={p.planId} title={p.planName} subtitle={`${p.activeMembers} active`} right={<Muted>{rupees(p.monthlyValue)}</Muted>} last={i === arr.length - 1} />)}
          </>
        )}
      </Card>

      <Section title="Check-ins, last 14 days" />
      <Card><BarChart color={colors.info} data={trend.map((t) => ({ label: t.date.slice(8), value: t.count }))} /></Card>

      <Section title="Equipment health" />
      <StatGrid>{(d?.equipmentByStatus ?? []).map((s) => <Stat key={s.status} label={cap(s.status)} value={s.count} tone={STATUS_TONE[s.status as keyof typeof STATUS_TONE]} />)}</StatGrid>

      <Section title="Overdue maintenance" />
      <Card style={{ paddingVertical: 4 }}>
        {(d?.equipmentOverdue ?? []).length === 0 && <EmptyState icon="checkmark-circle-outline" title="Nothing overdue" />}
        {(d?.equipmentOverdue ?? []).map((e, i, arr) => <Row key={e._id} icon="build" tone="warn" title={e.name} subtitle={`${e.category ?? 'Equipment'}${!branchId ? ` | ${branchName(e.branchId)}` : ''} | due ${fmtDate(e.nextServiceDue)}`} last={i === arr.length - 1} />)}
      </Card>
      <View style={{ height: 20 }} />
    </Screen>
  );
}
