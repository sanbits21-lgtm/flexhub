import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { BranchBar } from '../../components/BranchBar';
import { DateField } from '../../components/DateFields';
import { Banner, Body, Button, Card, Choice, EmptyState, ErrorText, Fab, Field, Loading, Muted, Pill, Row, Screen, Select, Sheet } from '../../components/ui';
import { api, type NoticeRow, type PlanRow } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useBranch } from '../../lib/branch';
import { confirmAction } from '../../lib/dialog';
import { cap, fmtDate } from '../../lib/format';
import { useLoad } from '../../lib/hooks';
import { dateInput } from '../../lib/time';

const KINDS = [{ value: 'news', label: 'News' }, { value: 'offer', label: 'Offer' }, { value: 'notice', label: 'Notice' }] as const;
const AUDIENCES = [
  { value: 'everyone', label: 'Every member' },
  { value: 'active', label: 'Active members' },
  { value: 'expiring', label: 'Expiring soon' },
  { value: 'expired', label: 'Expired members' },
  { value: 'plan', label: 'One plan' },
] as const;
type Audience = (typeof AUDIENCES)[number]['value'];
const STAGE_TONE = { live: 'success', scheduled: 'info', ended: 'neutral', withdrawn: 'warn' } as const;
const blank = { title: '', body: '', kind: 'news' as 'news' | 'offer' | 'notice', audience: 'everyone' as Audience, days: '7', planId: '', branchId: '', expiresAt: '', link: '' };

const audienceText = (n: NoticeRow, plans: PlanRow[]) => {
  const a = n.audience;
  if (a.type === 'expiring') return `Expiring in ${a.days ?? 7} days`;
  if (a.type === 'plan') return plans.find((p) => p._id === a.planId)?.name ?? 'One plan';
  return AUDIENCES.find((x) => x.value === a.type)?.label ?? a.type;
};

// Notices that appear in members' apps: news, an offer, a reminder. The owner can publish to any branch or the whole gym; a branch
// manager only to their own branch. Nothing is sent automatically from here, and a notice can be withdrawn.
export default function Announcements() {
  const { role } = useAuth();
  const admin = role === 'tenant-admin';
  const { scoped, branchId, branches, branchName } = useBranch();
  const { data, loading, error, reload } = useLoad(async () => {
    const [items, plans] = await Promise.all([
      api.get<NoticeRow[]>(scoped('/announcements')),
      api.get<PlanRow[]>('/membership-plans').catch(() => [] as PlanRow[]),
    ]);
    return { items, plans };
  }, [branchId]);
  const [open, setOpen] = useState<NoticeRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [f, setF] = useState({ ...blank });
  const [reach, setReach] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) => setF((s) => ({ ...s, [k]: v }));

  const branchIds = () => (admin ? (branchId || f.branchId ? [branchId || f.branchId] : []) : undefined);
  const audience = () => ({ type: f.audience, ...(f.audience === 'expiring' ? { days: Math.min(60, Math.max(1, Number(f.days) || 7)) } : {}), ...(f.audience === 'plan' ? { planId: f.planId } : {}) });

  // "This will reach 214 members", kept up to date while the form is open.
  useEffect(() => {
    if (!creating || (f.audience === 'plan' && !f.planId)) { setReach(null); return undefined; }
    let live = true;
    const t = setTimeout(() => {
      api.post<{ count: number }>(scoped('/announcements/preview'), { audience: audience(), ...(branchIds() ? { branchIds: branchIds() } : {}) })
        .then((r) => { if (live) setReach(r.count); }).catch(() => { if (live) setReach(null); });
    }, 350);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creating, f.audience, f.days, f.planId, f.branchId, branchId]);

  const openNew = () => { setF({ ...blank }); setErr(null); setReach(null); setCreating(true); };

  const publish = async () => {
    setErr(null);
    if (!f.title.trim()) { setErr('Give the notice a title.'); return; }
    if (!f.body.trim()) { setErr('Write the message.'); return; }
    if (f.audience === 'plan' && !f.planId) { setErr('Choose which plan this is for.'); return; }
    if (f.link.trim() && !/^https:\/\/\S+$/i.test(f.link.trim())) { setErr('The link must start with https://'); return; }
    if (f.expiresAt && f.expiresAt <= dateInput(new Date())) { setErr('The end date must be after today.'); return; }
    if (reach === 0 && !(await confirmAction('No members will see this', 'No member matches this audience right now. Publish it anyway?', 'Publish'))) return;
    setSaving(true);
    try {
      await api.post(scoped('/announcements'), {
        title: f.title.trim(), body: f.body.trim(), kind: f.kind, audience: audience(),
        ...(branchIds() ? { branchIds: branchIds() } : {}),
        ...(f.expiresAt ? { expiresAt: `${f.expiresAt}T23:59:59` } : {}),
        ...(f.link.trim() ? { link: f.link.trim() } : {}),
      });
      setCreating(false);
      await reload();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not publish.'); } finally { setSaving(false); }
  };

  const withdraw = async (n: NoticeRow) => {
    if (!(await confirmAction('Withdraw this notice?', 'Members will stop seeing it. This cannot be undone.', 'Withdraw'))) return;
    setSaving(true);
    try { await api.post(`/announcements/${n._id}/withdraw`, {}); setOpen(null); await reload(); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not withdraw.'); } finally { setSaving(false); }
  };

  if (loading && !data) return <Loading />;
  const items = data?.items ?? [];
  const plans = data?.plans ?? [];

  return (
    <Screen fab={<Fab title="New notice" icon="megaphone" onPress={openNew} />} onRefresh={reload}>
      <Stack.Screen options={{ title: 'Announcements' }} />
      <BranchBar />
      <ErrorText>{error}</ErrorText>
      {items.length === 0 ? (
        <Card><EmptyState icon="megaphone-outline" title="No notices yet" text="Publish news, an offer or a reminder. Members see it in their app." /></Card>
      ) : (
        <Card style={{ paddingVertical: 4 }}>
          {items.map((n, i) => (
            <Row key={n._id} icon="megaphone" title={n.title}
              subtitle={[cap(n.kind), audienceText(n, plans), `${n.readCount} of ${n.reach} read`, n.branchIds.length === 0 ? 'All branches' : n.branchIds.map(branchName).join(', ')].filter(Boolean).join(' | ')}
              right={<Pill label={n.stage} tone={STAGE_TONE[n.stage]} />} onPress={() => { setErr(null); setOpen(n); }} last={i === items.length - 1} />
          ))}
        </Card>
      )}
      <View style={{ height: 70 }} />

      <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.title}>
        {open && (
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}><Pill label={open.stage} tone={STAGE_TONE[open.stage]} /><Pill label={cap(open.kind)} /></View>
            <Body>{open.body}</Body>
            {open.link ? <Muted>{open.link}</Muted> : null}
            <Muted>
              {`For: ${audienceText(open, plans)}. ${open.readCount} of ${open.reach} members have read it.\nStarts ${fmtDate(open.startsAt)}${open.expiresAt ? `, ends ${fmtDate(open.expiresAt)}` : ''}.${open.createdByName ? `\nPublished by ${open.createdByName}.` : ''}`}
            </Muted>
            <ErrorText>{err}</ErrorText>
            {open.canManage && open.stage !== 'withdrawn' && open.stage !== 'ended'
              ? <Button title="Withdraw" kind="danger" onPress={() => { void withdraw(open); }} busy={saving} />
              : !open.canManage ? <Muted>Only the person who published this can withdraw it.</Muted> : null}
          </View>
        )}
      </Sheet>

      <Sheet open={creating} onClose={() => setCreating(false)} title="New notice">
        <Field label="Title" value={f.title} onChangeText={(v) => set('title', v)} maxLength={80} autoCapitalize="sentences" />
        <Field label="Message" value={f.body} onChangeText={(v) => set('body', v)} multiline maxLength={1000} />
        <Choice label="Type" value={f.kind} options={KINDS} onChange={(v) => set('kind', v)} />
        <Select label="Who sees it" value={f.audience} onChange={(v) => v && set('audience', v)} options={AUDIENCES.map((a) => ({ value: a.value, label: a.label }))} />
        {f.audience === 'expiring' && <Field label="Expiring within (days)" value={f.days} onChangeText={(v) => set('days', v.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" />}
        {f.audience === 'plan' && <Select label="Plan" value={f.planId} placeholder="Choose a plan" onChange={(v) => set('planId', v)} options={plans.map((p) => ({ value: p._id, label: p.name }))} />}
        {admin && !branchId && <Select label="Branch" value={f.branchId} placeholder="All branches" clearLabel="All branches" onChange={(v) => set('branchId', v)} options={branches.map((b) => ({ value: b._id, label: b.name }))} />}
        <DateField label="Show until (optional)" value={f.expiresAt} onChange={(v) => set('expiresAt', v)} minimumDate={new Date(Date.now() + 86400000)} clearable />
        <Field label="Link (optional)" value={f.link} onChangeText={(v) => set('link', v)} autoCapitalize="none" keyboardType="url" placeholder="https://" />
        {reach !== null && <Banner tone={reach === 0 ? 'warn' : 'info'}>{reach === 0 ? 'No members match this audience right now.' : `This will reach ${reach} member${reach === 1 ? '' : 's'}.`}</Banner>}
        <ErrorText>{err}</ErrorText>
        <View style={{ marginTop: 6 }}><Button title="Publish" icon="megaphone" onPress={() => { void publish(); }} busy={saving} /></View>
      </Sheet>
    </Screen>
  );
}
