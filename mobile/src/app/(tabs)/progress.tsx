import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';
import { Banner, Button, Card, EmptyState, ErrorText, Field, Loading, Muted, Pill, Row, Screen, Section, Stat, StatGrid } from '../../components/ui';
import { DateField } from '../../components/DateFields';
import { api, type Achievement, type ProgressData, type ProgressEntry } from '../../lib/api';
import { confirmAction } from '../../lib/dialog';
import { fmtDate } from '../../lib/format';
import { useLoad } from '../../lib/hooks';
import { dateInput } from '../../lib/time';
import { colors } from '../../lib/theme';

const signed = (n: number | null, unit: string) => (n === null ? '-' : `${n > 0 ? '+' : ''}${n} ${unit}`);

// A plain line chart of weight over time (react-native-svg is already in the app for the QR code).
function WeightChart({ metrics }: { metrics: ProgressEntry[] }) {
  const points = metrics.filter((m) => typeof m.weightKg === 'number') as (ProgressEntry & { weightKg: number })[];
  if (points.length < 2) return <Muted>Add a second measurement to see your line.</Muted>;
  const W = 300; const H = 130; const pad = 18;
  const times = points.map((p) => new Date(p.date).getTime());
  const kgs = points.map((p) => p.weightKg);
  const [t0, t1] = [Math.min(...times), Math.max(...times)];
  const [lo, hi] = [Math.min(...kgs), Math.max(...kgs)];
  const x = (t: number) => pad + (t1 === t0 ? 0.5 : (t - t0) / (t1 - t0)) * (W - 2 * pad);
  const y = (kg: number) => H - pad - (hi === lo ? 0.5 : (kg - lo) / (hi - lo)) * (H - 2 * pad);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(times[i]!).toFixed(1)},${y(p.weightKg).toFixed(1)}`).join(' ');
  return (
    <View accessible accessibilityLabel={`Weight from ${points[0]!.weightKg} kg to ${points[points.length - 1]!.weightKg} kg over ${points.length} measurements`}>
      <Svg viewBox={`0 0 ${W} ${H}`} width="100%" height={150}>
        <Path d={d} fill="none" stroke={colors.accent} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => <Circle key={p._id} cx={x(times[i]!)} cy={y(p.weightKg)} r={3.5} fill={colors.accent} />)}
        <SvgText x={pad} y={11} fontSize={10} fill={colors.muted}>{`${hi} kg`}</SvgText>
        <SvgText x={pad} y={H - 4} fontSize={10} fill={colors.muted}>{`${lo} kg`}</SvgText>
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Muted>{fmtDate(points[0]!.date)}</Muted>
        <Muted>{fmtDate(points[points.length - 1]!.date)}</Muted>
      </View>
    </View>
  );
}

function Badge({ a }: { a: Achievement }) {
  const pct = Math.max(2, Math.round((a.progress.value / a.progress.target) * 100));
  return (
    <View style={{ borderWidth: 1, borderRadius: 14, padding: 12, borderColor: a.earned ? colors.accent : colors.line, backgroundColor: a.earned ? colors.accentSoft : 'transparent', gap: 2 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <Text style={{ color: a.earned ? colors.ink : colors.muted, fontWeight: '800', fontSize: 14, flex: 1 }}>{a.title}</Text>
        {a.earned ? <Pill label="Earned" tone="accent" /> : null}
      </View>
      <Muted>{a.text}</Muted>
      {!a.earned ? (
        <View style={{ marginTop: 6 }} accessible accessibilityLabel={`${a.progress.value} of ${a.progress.target}`}>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surface2 }}><View style={{ height: 6, borderRadius: 3, backgroundColor: colors.accent, width: `${pct}%` }} /></View>
          <Text style={{ color: colors.faint, fontSize: 12, marginTop: 4 }}>{a.progress.value} / {a.progress.target}</Text>
        </View>
      ) : null}
    </View>
  );
}

// The member's own body changes and badges. Private: only the member (and the trainer who takes
// the measurements with them) sees it.
export default function Progress() {
  const { data, loading, error, reload, setData } = useLoad(() => api.get<ProgressData>('/member-app/progress'));
  const [weight, setWeight] = useState('');
  const [fat, setFat] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(dateInput(new Date()));
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (loading && !data) return <Loading />;
  if (!data) return <Screen title="Progress" onRefresh={reload}><ErrorText>{error}</ErrorText></Screen>;

  const { summary, stats, metrics, achievements } = data;
  const earned = achievements.filter((a) => a.earned).length;
  const groups = [...new Set(achievements.map((a) => a.group))];

  const add = async () => {
    setBusy(true);
    setFormError(null);
    try {
      const body: Record<string, string> = { date };
      if (weight !== '') body.weightKg = weight;
      if (fat !== '') body.bodyFatPct = fat;
      if (note.trim()) body.notes = note.trim();
      setData(await api.post<ProgressData>('/member-app/progress', body));
      setWeight(''); setFat(''); setNote(''); setDate(dateInput(new Date()));
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not save that measurement.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!(await confirmAction('Delete measurement', 'Delete this measurement?', 'Delete'))) return;
    try { setData(await api.delete<ProgressData>(`/member-app/progress/${id}`)); } catch (e) { setFormError(e instanceof Error ? e.message : 'Could not delete it.'); }
  };

  return (
    <Screen title="Progress" subtitle={`${earned} of ${achievements.length} badges`} onRefresh={reload}>
      <ErrorText>{error}</ErrorText>
      <Banner>Only you can see this. Your trainer sees the measurements they take with you.</Banner>

      <StatGrid>
        <Stat label="Weight now" value={summary.latestWeightKg !== null ? `${summary.latestWeightKg} kg` : '-'} hint={summary.bmi ? `BMI ${summary.bmi}` : undefined} />
        <Stat label="Since you started" value={signed(summary.changeKg, 'kg')} hint={summary.changeBodyFatPct !== null ? `Body fat ${signed(summary.changeBodyFatPct, 'pts')}` : undefined} />
        <Stat label="Visits this month" value={stats.visitsThisMonth} hint={`${stats.totalVisits} in total`} />
        <Stat label="Weeks in a row" value={stats.currentStreakWeeks} hint={`Best ${stats.bestStreakWeeks}`} />
      </StatGrid>

      <Section title="Your weight" />
      <Card><WeightChart metrics={metrics} /></Card>

      <Section title="Add a measurement" />
      <Card style={{ gap: 4 }}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}><Field label="Weight (kg)" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" /></View>
          <View style={{ flex: 1 }}><Field label="Body fat % (optional)" value={fat} onChangeText={setFat} keyboardType="decimal-pad" /></View>
        </View>
        <DateField label="Date" value={date} onChange={setDate} maximumDate={new Date()} />
        <Field label="Note (optional)" value={note} onChangeText={setNote} maxLength={200} />
        <ErrorText>{formError}</ErrorText>
        <Button title="Save measurement" busy={busy} disabled={weight === '' && fat === ''} onPress={() => void add()} />
      </Card>

      <Section title="Badges" />
      {groups.map((g) => (
        <Card key={g} style={{ gap: 8 }}>
          <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' }}>{g}</Text>
          {achievements.filter((a) => a.group === g).map((a) => <Badge key={a.key} a={a} />)}
        </Card>
      ))}
      {!data.goal ? <Muted>Set your goal in Profile to unlock weight badges.</Muted> : null}

      <Section title="History" />
      {metrics.length === 0 ? (
        <Card><EmptyState icon="analytics-outline" title="Nothing yet" text="Your first measurement starts the chart." /></Card>
      ) : (
        <Card style={{ paddingVertical: 4 }}>
          {[...metrics].reverse().map((m, i, all) => (
            <Row
              key={m._id}
              title={[m.weightKg ? `${m.weightKg} kg` : null, m.bodyFatPct ? `${m.bodyFatPct}% fat` : null].filter(Boolean).join('  |  ')}
              subtitle={`${fmtDate(m.date)}${m.notes ? ` - ${m.notes}` : ''}${m.source === 'staff' ? ' - taken by your trainer' : ''}`}
              right={m.source === 'member' ? (
                <Pressable onPress={() => void remove(m._id)} accessibilityRole="button" accessibilityLabel="Delete measurement" hitSlop={10}>
                  <Text style={{ color: colors.danger, fontWeight: '700', fontSize: 13 }}>Delete</Text>
                </Pressable>
              ) : undefined}
              last={i === all.length - 1}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}
