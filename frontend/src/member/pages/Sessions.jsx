import { useState } from 'react';
import { memberApi, errorText } from '../api';
import { useLoad } from '../useLoad';
import { Btn, Card, EmptyState, ErrorText, LoadState, Loading, Muted, Pill, Row, Screen, Section } from '../ui';
import { dayKey, dayLabel, fmtRange } from '../format';

const TONE = { scheduled: 'success', completed: 'neutral', 'no-show': 'danger', cancelled: 'neutral', booked: 'success', waitlisted: 'warn' };
const LABEL = { scheduled: 'Booked', completed: 'Done', 'no-show': 'Missed', cancelled: 'Cancelled', booked: 'Booked', waitlisted: 'Waitlist' };

export default function Sessions() {
  const { data, loading, error, stale, reload } = useLoad('sessions', () => memberApi.get('/member-app/sessions').then((r) => r.data));
  const [busyId, setBusyId] = useState(null);
  const [cancelError, setCancelError] = useState('');

  if (loading) return <Loading />;
  const now = Date.now();
  const training = data?.training ?? [];
  const upcoming = training.filter((s) => s.status === 'scheduled' && new Date(s.startAt).getTime() > now);
  const recent = training.filter((s) => !upcoming.includes(s)).reverse();
  const classes = data?.classes ?? [];

  const cancel = async (id) => {
    if (!window.confirm('Cancel this session? Your trainer will see it is cancelled.')) return;
    setBusyId(id);
    setCancelError('');
    try {
      await memberApi.post(`/member-app/sessions/${id}/cancel`);
      await reload();
    } catch (err) {
      setCancelError(errorText(err, 'Could not cancel. Try again.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Screen title="Sessions" subtitle="Your schedule">
      <LoadState error={error} stale={stale} onRetry={reload} />
      <ErrorText>{cancelError}</ErrorText>

      <Section title="Personal training" />
      {upcoming.length === 0 ? (
        <Card><EmptyState title="Nothing booked" text="Your trainer will schedule sessions with you." /></Card>
      ) : upcoming.map((s) => (
        <Card key={s._id} className="space-y-2">
          <Pill tone="success">Booked</Pill>
          <Row last title={`${dayLabel(dayKey(s.startAt))}, ${fmtRange(s.startAt, s.endAt)}`} subtitle={`${s.trainerName ? `With ${s.trainerName}` : 'Personal training'}${s.focus ? ` | ${s.focus}` : ''}`} />
          {s.notes ? <Muted>{s.notes}</Muted> : null}
          <Btn kind="ghost" small busy={busyId === s._id} onClick={() => cancel(s._id)}>Cancel session</Btn>
        </Card>
      ))}

      <Section title="Group classes" />
      <Card className="py-1">
        {classes.length === 0 && <Muted className="py-3">You are not booked into any classes. Ask the front desk to book you in.</Muted>}
        {classes.map((c, i) => (
          <Row key={c._id} title={c.name} subtitle={`${dayLabel(dayKey(c.startAt))}, ${fmtRange(c.startAt, c.endAt)}${c.trainerName ? ` | ${c.trainerName}` : ''}`}
            right={<Pill tone={TONE[c.status]}>{LABEL[c.status]}</Pill>} last={i === classes.length - 1} />
        ))}
      </Card>

      {recent.length > 0 && (
        <>
          <Section title="Recent" />
          <Card className="py-1">
            {recent.map((s, i) => (
              <Row key={s._id} title={`${dayLabel(dayKey(s.startAt))}, ${fmtRange(s.startAt, s.endAt)}`} right={<Pill tone={TONE[s.status]}>{LABEL[s.status]}</Pill>} last={i === recent.length - 1} />
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}
