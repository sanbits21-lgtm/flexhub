import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { DateField, TimeField } from '../../components/DateFields';
import {
  Banner, Button, Card, Choice, EmptyState, ErrorText, Fab, Field, Loading, Muted, Pill, Row, Screen, Section, Select, Sheet,
} from '../../components/ui';
import {
  api, type ClassSessionRow, type ClassType, type PtSession, type RosterBooking, type StaffRow, type TrainerMember,
} from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useBranch } from '../../lib/branch';
import { confirmAction, say } from '../../lib/dialog';
import { useLoad } from '../../lib/hooks';
import { colors } from '../../lib/theme';
import { addMinutes, dateInput, dayKey, dayLabel, fmtRange, parseLocal } from '../../lib/time';

type Item =
  | { kind: 'pt'; key: string; startAt: string; endAt: string; data: PtSession }
  | { kind: 'class'; key: string; startAt: string; endAt: string; data: ClassSessionRow };

const DURATIONS = [{ value: '30', label: '30 min' }, { value: '45', label: '45 min' }, { value: '60', label: '60 min' }, { value: '90', label: '90 min' }] as const;
const TONE = { scheduled: 'success', completed: 'neutral', 'no-show': 'danger', cancelled: 'neutral', booked: 'success', waitlisted: 'warn', attended: 'success' } as const;
const LABEL: Record<string, string> = { scheduled: 'Scheduled', completed: 'Done', 'no-show': 'No-show', cancelled: 'Cancelled', booked: 'Booked', waitlisted: 'Waitlist', attended: 'Attended' };

const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return dateInput(d); };

// Used by trainers (their own sessions) and by managers (the whole branch). The server
// scopes what comes back; the only differences here are who can be picked as the trainer.
export default function Schedule() {
  const params = useLocalSearchParams<{ memberId?: string }>();
  const { role } = useAuth();
  const { scoped, branchId: pickedBranch } = useBranch();
  const manager = role !== 'trainer';

  const { data, loading, error, reload } = useLoad(async () => {
    const from = new Date(); from.setDate(from.getDate() - 2); from.setHours(0, 0, 0, 0);
    const to = new Date(); to.setDate(to.getDate() + 15); to.setHours(0, 0, 0, 0);
    const q = `from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
    // A gym can switch either feature off; that leaves its half of the schedule out rather than failing the screen.
    const [pt, classes] = await Promise.all([
      api.get<PtSession[]>(scoped(`/pt-sessions?${q}`)).catch(() => null),
      api.get<ClassSessionRow[]>(scoped(`/class-sessions?${q}`)).catch(() => null),
    ]);
    return { pt, classes };
  }, [pickedBranch]);

  const [members, setMembers] = useState<TrainerMember[]>([]);
  const [trainers, setTrainers] = useState<StaffRow[]>([]);
  const [classTypes, setClassTypes] = useState<ClassType[]>([]);
  useEffect(() => {
    api.get<{ members: TrainerMember[] }>(scoped('/members?limit=200')).then((r) => setMembers(r.members)).catch(() => {});
    api.get<ClassType[]>('/class-types').then((r) => setClassTypes(r.filter((c) => (c as ClassType & { isActive?: boolean }).isActive !== false))).catch(() => {});
    if (manager) api.get<StaffRow[]>(scoped('/staff?role=trainer')).then((r) => setTrainers(r.filter((t) => t.isActive))).catch(() => {});
  }, [pickedBranch]);

  // ---------- form ----------
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'pt' | 'class'>('pt');
  const [memberId, setMemberId] = useState('');
  const [trainerId, setTrainerId] = useState('');
  const [classTypeId, setClassTypeId] = useState('');
  const [date, setDate] = useState(tomorrow());
  const [time, setTime] = useState('18:00');
  const [duration, setDuration] = useState('60');
  const [focus, setFocus] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (params.memberId) { setOpen(true); setKind('pt'); setMemberId(params.memberId); }
  }, [params.memberId]);

  const ptEnabled = data?.pt !== null;
  const classesEnabled = data?.classes !== null;
  const chosenType = classTypes.find((c) => c._id === classTypeId);
  const needsBranch = role === 'tenant-admin' && !pickedBranch && kind === 'class';

  const submit = async () => {
    setFormError(null);
    const start = parseLocal(date, time);
    if (!start) { setFormError('Enter the date as YYYY-MM-DD and the time as HH:MM (24 hour), for example 2026-11-05 and 18:30.'); return; }
    setSaving(true);
    try {
      if (kind === 'pt') {
        if (!memberId) { setFormError('Choose a member.'); return; }
        if (manager && !trainerId) { setFormError('Choose the trainer.'); return; }
        await api.post('/pt-sessions', { memberId, ...(manager ? { trainerId } : {}), startAt: start.toISOString(), endAt: addMinutes(start, Number(duration)).toISOString(), focus: focus.trim() || undefined });
      } else {
        if (!chosenType) { setFormError('Choose a class.'); return; }
        if (needsBranch) { setFormError('Pick a branch on the Home tab first.'); return; }
        await api.post(scoped('/class-sessions'), { classTypeId, ...(manager && trainerId ? { trainerId } : {}), startAt: start.toISOString(), endAt: addMinutes(start, chosenType.durationMinutes).toISOString() });
      }
      setOpen(false); setFocus(''); setMemberId('');
      await reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not schedule.');
    } finally {
      setSaving(false);
    }
  };

  // ---------- list ----------
  const items: Item[] = useMemo(() => [
    ...(data?.pt ?? []).filter((s) => s.status !== 'cancelled').map((s): Item => ({ kind: 'pt', key: `pt-${s._id}`, startAt: s.startAt, endAt: s.endAt, data: s })),
    ...(data?.classes ?? []).filter((s) => s.status !== 'cancelled').map((s): Item => ({ kind: 'class', key: `c-${s._id}`, startAt: s.startAt, endAt: s.endAt, data: s })),
  ].sort((a, b) => a.startAt.localeCompare(b.startAt)), [data]);

  const days = useMemo(() => {
    const map = new Map<string, Item[]>();
    items.forEach((i) => map.set(dayKey(i.startAt), [...(map.get(dayKey(i.startAt)) ?? []), i]));
    return [...map.entries()];
  }, [items]);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [roster, setRoster] = useState<Record<string, RosterBooking[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [addTo, setAddTo] = useState<string | null>(null); // class session id, when adding a member to its roster
  const [addMember, setAddMember] = useState('');

  const loadRoster = async (id: string) => {
    const list = await api.get<RosterBooking[]>(`/bookings?classSessionId=${id}`);
    setRoster((r) => ({ ...r, [id]: list.filter((b) => b.status !== 'cancelled') }));
  };
  const toggle = async (item: Item) => {
    const next = expanded === item.key ? null : item.key;
    setExpanded(next);
    if (next && item.kind === 'class' && !roster[item.data._id]) { try { await loadRoster(item.data._id); } catch { /* shows empty */ } }
  };
  const act = async (id: string, run: () => Promise<unknown>, after?: () => Promise<void>) => {
    setBusy(id);
    try { await run(); await (after ? after() : reload()); } catch (e) { say('Could not update', e instanceof Error ? e.message : 'Try again.'); } finally { setBusy(null); }
  };

  if (loading) return <Loading />;
  const now = Date.now();
  const canCreate = ptEnabled || classesEnabled;

  return (
    <Screen title="Schedule" subtitle={manager ? 'Branch calendar' : 'Your sessions'} onRefresh={reload}
      fab={canCreate ? <Fab title="Schedule" onPress={() => { setOpen(true); setKind(ptEnabled ? 'pt' : 'class'); }} /> : undefined}>
      <ErrorText>{error}</ErrorText>
      {!canCreate && <Card><Muted>Scheduling is not turned on for your gym.</Muted></Card>}
      {canCreate && days.length === 0 && <Card><EmptyState icon="calendar-outline" title="Nothing scheduled" text="Tap Schedule to add a session." /></Card>}

      {days.map(([key, list]) => (
        <View key={key} style={{ gap: 10 }}>
          <Section title={dayLabel(key)} />
          {list.map((item) => {
            const isOpen = expanded === item.key;
            const ended = new Date(item.endAt).getTime() < now;
            const started = new Date(item.startAt).getTime() <= now;
            const st = item.data.status;
            const needsOutcome = item.kind === 'pt' && st === 'scheduled' && ended;
            return (
              <Card key={item.key} onPress={() => toggle(item)} style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 62 }}>
                    <Text style={{ color: colors.ink, fontWeight: '800', fontSize: 15 }}>{fmtRange(item.startAt, item.endAt).split(' - ')[0]}</Text>
                    <Muted>{fmtRange(item.startAt, item.endAt).split(' - ')[1]}</Muted>
                  </View>
                  <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: item.kind === 'pt' ? colors.accent : colors.violet }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 16 }} numberOfLines={1}>
                      {item.kind === 'pt' ? item.data.memberId?.name ?? 'Member' : item.data.classTypeId?.name ?? 'Class'}
                    </Text>
                    <Muted>
                      {item.kind === 'pt'
                        ? `1-on-1${manager && item.data.trainerId ? ` | ${item.data.trainerId.name}` : ''}${item.data.focus ? ` | ${item.data.focus}` : ''}`
                        : `Class | ${item.data.bookedCount}/${item.data.capacity ?? item.data.classTypeId?.defaultCapacity ?? '?'} booked`}
                    </Muted>
                  </View>
                  <Pill label={needsOutcome ? 'Needs outcome' : LABEL[st]} tone={needsOutcome ? 'warn' : TONE[st]} />
                </View>

                {isOpen && item.kind === 'pt' && (
                  <View style={{ gap: 8 }}>
                    {item.data.memberId?.phone ? <Muted>Phone: {item.data.memberId.phone}</Muted> : null}
                    {item.data.notes ? <Muted>{item.data.notes}</Muted> : null}
                    {st === 'scheduled' && started && (
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <View style={{ flex: 1 }}><Button title="Mark done" small onPress={() => act(item.data._id, () => api.post(`/pt-sessions/${item.data._id}/complete`))} busy={busy === item.data._id} /></View>
                        <View style={{ flex: 1 }}><Button title="No-show" kind="secondary" small onPress={() => act(item.data._id, () => api.post(`/pt-sessions/${item.data._id}/no-show`))} busy={busy === item.data._id} /></View>
                      </View>
                    )}
                    {st === 'scheduled' && (
                      <Button title="Cancel session" kind="danger" small busy={busy === item.data._id}
                        onPress={async () => { if (await confirmAction('Cancel this session?', `${item.data.memberId?.name ?? 'The member'} will see it as cancelled.`, 'Cancel session')) await act(item.data._id, () => api.post(`/pt-sessions/${item.data._id}/cancel`)); }} />
                    )}
                  </View>
                )}

                {isOpen && item.kind === 'class' && (
                  <View style={{ gap: 2 }}>
                    {(roster[item.data._id] ?? []).length === 0 && <Muted>No one is booked yet.</Muted>}
                    {(roster[item.data._id] ?? []).map((b, i, arr) => (
                      <View key={b._id}>
                        <Row title={b.memberId?.name ?? 'Member'} subtitle={b.memberId?.memberCode} right={<Pill label={LABEL[b.status] ?? b.status} tone={TONE[b.status as keyof typeof TONE] ?? 'neutral'} />} last={i === arr.length - 1 && b.status !== 'booked'} />
                        {b.status === 'booked' && started && (
                          <View style={{ flexDirection: 'row', gap: 8, paddingBottom: 10 }}>
                            <View style={{ flex: 1 }}><Button title="Attended" small onPress={() => act(b._id, () => api.post(`/bookings/${b._id}/attended`), () => loadRoster(item.data._id))} busy={busy === b._id} /></View>
                            <View style={{ flex: 1 }}><Button title="No-show" kind="secondary" small onPress={() => act(b._id, () => api.post(`/bookings/${b._id}/no-show`), () => loadRoster(item.data._id))} busy={busy === b._id} /></View>
                          </View>
                        )}
                      </View>
                    ))}
                    {!ended && st === 'scheduled' && (
                      <View style={{ gap: 8, marginTop: 8 }}>
                        <Button title="Add a member" kind="secondary" small icon="person-add" onPress={() => { setAddTo(item.data._id); setAddMember(''); }} />
                        <Button title="Cancel class" kind="danger" small busy={busy === item.data._id}
                          onPress={async () => { if (await confirmAction('Cancel this class?', 'Everyone booked will see it as cancelled.', 'Cancel class')) await act(item.data._id, () => api.put(`/class-sessions/${item.data._id}`, { status: 'cancelled' })); }} />
                      </View>
                    )}
                  </View>
                )}
              </Card>
            );
          })}
        </View>
      ))}

      <Sheet open={open} onClose={() => setOpen(false)} title="New session">
        {ptEnabled && classesEnabled && (
          <Choice label="Type" value={kind} options={[{ value: 'pt', label: '1-on-1 training' }, { value: 'class', label: 'Group class' }]} onChange={setKind} />
        )}
        {kind === 'pt' ? (
          <>
            <Select label="Member" value={memberId} searchable placeholder="Choose a member" onChange={(v) => setMemberId(v)} options={members.map((m) => ({ value: m._id, label: m.name, hint: m.memberCode }))} />
            {manager && <Select label="Trainer" value={trainerId} placeholder="Choose a trainer" onChange={(v) => setTrainerId(v)} options={trainers.map((t) => ({ value: t._id, label: t.name, hint: t.specialization }))} />}
            <Choice label="Length" value={duration as '60'} options={DURATIONS} onChange={setDuration} />
            <Field label="Focus (optional)" value={focus} onChangeText={setFocus} placeholder="Legs, mobility, fat loss..." />
          </>
        ) : (
          <>
            {needsBranch && <View style={{ marginBottom: 14 }}><Banner tone="warn">Pick a branch on the Home tab first, so the class is created at the right branch.</Banner></View>}
            <Choice label="Class" value={classTypeId || null} options={classTypes.map((c) => ({ value: c._id, label: `${c.name} (${c.durationMinutes} min)` }))} onChange={setClassTypeId} />
            {classTypes.length === 0 && <Muted>No class types are set up yet.</Muted>}
            {manager && <Select label="Trainer (optional)" value={trainerId} placeholder="Unassigned" clearLabel="Unassigned" onChange={(v) => setTrainerId(v)} options={trainers.map((t) => ({ value: t._id, label: t.name }))} />}
          </>
        )}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1.4 }}><DateField label="Date" value={date} onChange={setDate} minimumDate={new Date()} /></View>
          <View style={{ flex: 1 }}><TimeField label="Time" value={time} onChange={setTime} /></View>
        </View>
        <ErrorText>{formError}</ErrorText>
        <View style={{ height: 10 }} />
        <Button title="Schedule" onPress={submit} busy={saving} />
      </Sheet>

      <Sheet open={!!addTo} onClose={() => setAddTo(null)} title="Add a member to this class">
        <Select label="Member" value={addMember} searchable placeholder="Choose a member" onChange={(v) => setAddMember(v)} options={members.map((m) => ({ value: m._id, label: m.name, hint: m.memberCode }))} />
        <Button title="Add to class" disabled={!addMember} busy={busy === 'add'} onPress={() => act('add', () => api.post('/bookings', { classSessionId: addTo, memberId: addMember }), async () => { await loadRoster(addTo!); await reload(); setAddTo(null); })} />
      </Sheet>
    </Screen>
  );
}
