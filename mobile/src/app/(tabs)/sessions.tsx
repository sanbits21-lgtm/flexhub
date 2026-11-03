import { useState } from 'react';
import { Card, EmptyState, ErrorText, Button, Loading, Muted, Pill, Row, Screen, Section } from '../../components/ui';
import { api, type MySessions } from '../../lib/api';
import { confirmAction, say } from '../../lib/dialog';
import { useLoad } from '../../lib/hooks';
import { dayKey, dayLabel, fmtRange } from '../../lib/time';

const TONE = { scheduled: 'success', completed: 'neutral', 'no-show': 'danger', cancelled: 'neutral', booked: 'success', waitlisted: 'warn' } as const;
const LABEL: Record<string, string> = { scheduled: 'Booked', completed: 'Done', 'no-show': 'Missed', cancelled: 'Cancelled', booked: 'Booked', waitlisted: 'Waitlist' };

export default function Sessions() {
  const { data, loading, error, reload } = useLoad(() => api.get<MySessions>('/member-app/sessions'));
  const [busyId, setBusyId] = useState<string | null>(null);

  if (loading) return <Loading />;
  const now = Date.now();
  const training = data?.training ?? [];
  const upcoming = training.filter((s) => s.status === 'scheduled' && new Date(s.startAt).getTime() > now);
  const recent = training.filter((s) => !upcoming.includes(s)).reverse();
  const classes = data?.classes ?? [];

  const cancel = async (id: string) => {
    if (!(await confirmAction('Cancel this session?', 'Your trainer will see it is cancelled.', 'Cancel session'))) return;
    setBusyId(id);
    try { await api.post(`/member-app/sessions/${id}/cancel`); await reload(); } catch (e) { say('Could not cancel', e instanceof Error ? e.message : 'Try again.'); } finally { setBusyId(null); }
  };

  return (
    <Screen title="Sessions" subtitle="Your schedule" onRefresh={reload}>
      <ErrorText>{error}</ErrorText>

      <Section title="Personal training" />
      {upcoming.length === 0 ? (
        <Card><EmptyState icon="calendar-outline" title="Nothing booked" text="Your trainer will schedule sessions with you." /></Card>
      ) : upcoming.map((s) => (
        <Card key={s._id} style={{ gap: 6 }}>
          <Pill label="Booked" tone="success" />
          <Row title={`${dayLabel(dayKey(s.startAt))}, ${fmtRange(s.startAt, s.endAt)}`} subtitle={`${s.trainerName ? `With ${s.trainerName}` : 'Personal training'}${s.focus ? ` | ${s.focus}` : ''}`} last />
          {s.notes ? <Muted>{s.notes}</Muted> : null}
          <Button title="Cancel session" kind="ghost" small onPress={() => cancel(s._id)} busy={busyId === s._id} />
        </Card>
      ))}

      <Section title="Group classes" />
      <Card>
        {classes.length === 0 && <Muted>You are not booked into any classes. Ask the front desk to book you in.</Muted>}
        {classes.map((c, i) => (
          <Row key={c._id} icon="people" title={c.name} subtitle={`${dayLabel(dayKey(c.startAt))}, ${fmtRange(c.startAt, c.endAt)}${c.trainerName ? ` | ${c.trainerName}` : ''}`}
            right={<Pill label={LABEL[c.status]} tone={TONE[c.status]} />} last={i === classes.length - 1} />
        ))}
      </Card>

      {recent.length > 0 && (
        <>
          <Section title="Recent" />
          <Card>
            {recent.map((s, i) => (
              <Row key={s._id} title={`${dayLabel(dayKey(s.startAt))}, ${fmtRange(s.startAt, s.endAt)}`} right={<Pill label={LABEL[s.status]} tone={TONE[s.status]} />} last={i === recent.length - 1} />
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}
