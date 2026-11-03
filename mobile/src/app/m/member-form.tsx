import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Banner, Button, Card, Choice, Field, H, Loading, Screen, Select } from '../../components/ui';
import { DateField } from '../../components/DateFields';
import { PaymentCollector } from '../../components/PaymentCollector';
import { Receipt, type ReceiptData } from '../../components/Receipt';
import { api, type MemberRow, type PaymentRow, type PlanRow, type StaffRow } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useBranch } from '../../lib/branch';
import { rupees } from '../../lib/format';
import { dateInput } from '../../lib/time';

const GENDERS = [{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }] as const;
const blank = { name: '', phone: '', email: '', gender: '' as '' | 'male' | 'female' | 'other', dob: '', emergencyName: '', emergencyPhone: '', trainerId: '', planId: '', start: dateInput(new Date()), discount: '', branchId: '' };

// Adds a member (and takes their first payment) or edits an existing one. Changing a
// member's plan is a renewal, not an edit, so the plan field only exists when adding.
export default function MemberForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = !!id;
  const { can, role } = useAuth();
  const { branches, branchId: scopedBranch, scoped } = useBranch();
  const [form, setForm] = useState({ ...blank });
  const [loading, setLoading] = useState(editing);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [trainers, setTrainers] = useState<StaffRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<{ member: MemberRow; amount: number; planName: string } | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const set = <K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    api.get<PlanRow[]>('/membership-plans').then((r) => setPlans(r.filter((p) => p.isActive))).catch(() => {});
    api.get<StaffRow[]>(scoped('/staff?role=trainer')).then((r) => setTrainers(r.filter((t) => t.isActive))).catch(() => {});
    if (editing) {
      api.get<MemberRow>(`/members/${id}`).then((m) => setForm({
        ...blank, name: m.name, phone: m.phone, email: m.email ?? '', gender: (m.gender as typeof blank.gender) ?? '', dob: m.dob ? m.dob.slice(0, 10) : '',
        emergencyName: m.emergencyContact?.name ?? '', emergencyPhone: m.emergencyContact?.phone ?? '', trainerId: m.assignedTrainerId ?? '',
      })).catch((e) => setError(e instanceof Error ? e.message : 'Could not load the member.')).finally(() => setLoading(false));
    }
  }, [id]);

  const plan = plans.find((p) => p._id === form.planId);
  const amount = useMemo(() => (plan ? Math.round(plan.price * (1 - (Number(form.discount) || 0) / 100)) : 0), [plan, form.discount]);
  const personal = can('fields:memberPersonalDetails');
  const needsBranch = !editing && role === 'tenant-admin' && !scopedBranch && !form.branchId;

  const submit = async () => {
    setError(null);
    // Checked here first so each problem is shown next to its own field, not as one line at the bottom.
    const problems: Record<string, string> = {};
    if (!form.name.trim()) problems.name = 'Enter the member\'s name.';
    if (!form.phone.trim()) problems.phone = 'Enter a phone number.';
    else if (!/^\+?[0-9(][0-9\s\-()]{5,17}$/.test(form.phone.trim())) problems.phone = 'Use digits only, for example 98765 43210.';
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) problems.email = 'This does not look like an email address.';
    if (needsBranch) problems.branch = 'Choose which branch this member joins.';
    setFe(problems);
    if (Object.keys(problems).length) { setError('Please fix the highlighted fields.'); return; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = { name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim() };
      if (personal) {
        if (form.gender) body.gender = form.gender;
        if (form.dob) body.dob = form.dob;
        if (form.emergencyName || form.emergencyPhone) body.emergencyContact = { name: form.emergencyName.trim(), phone: form.emergencyPhone.trim() };
      }
      if (can('features:trainerAssignment')) body.assignedTrainerId = form.trainerId || null;
      if (editing) {
        await api.put(`/members/${id}`, body);
        router.back();
        return;
      }
      if (form.planId) { body.membershipPlanId = form.planId; body.membershipStart = form.start; }
      if (role === 'tenant-admin') body.branchId = scopedBranch || form.branchId;
      const member = await api.post<MemberRow>(scoped('/members'), body);
      if (plan) setCreated({ member, amount, planName: plan.name });
      else router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;

  if (created) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Take payment', headerBackVisible: false }} />
        {receipt ? <Receipt r={receipt} onDone={() => router.back()} /> : (
          <>
            <Banner tone="success">{created.member.name} is enrolled on {created.planName}. Now take the first payment.</Banner>
            <PaymentCollector simple amount={created.amount} note={created.planName} ctaLabel="Collect"
              onRecord={async (method, status) => {
                const p = await api.post<PaymentRow>('/payments', { memberId: created.member._id, membershipPlanId: plan?._id, amount: created.amount, method, status });
                setReceipt({ title: status === 'paid' ? 'Welcome aboard' : 'Saved as pending', amount: created.amount, status: p.status, memberName: created.member.name, invoice: p.invoiceNumber, method, planName: created.planName, validUntil: created.member.membershipEnd });
              }} />
            <Button title="Skip, collect later" kind="ghost" small onPress={() => router.back()} />
          </>
        )}
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: editing ? 'Edit member' : 'New member' }} />
      {error ? <Banner tone="danger">{error}{fe.branch ? ` ${fe.branch}` : ''}</Banner> : null}
      <Card>
        <H>Basics</H>
        <Field label="Full name" value={form.name} onChangeText={(v) => set('name', v)} autoCapitalize="words" error={fe.name} />
        <Field label="Phone" value={form.phone} onChangeText={(v) => set('phone', v)} keyboardType="phone-pad" error={fe.phone} />
        <Field label="Email (optional)" value={form.email} onChangeText={(v) => set('email', v)} keyboardType="email-address" autoCapitalize="none" error={fe.email} />
        {personal && (
          <>
            <Choice label="Gender" value={form.gender || null} options={GENDERS} onChange={(v) => set('gender', v)} />
            <DateField label="Date of birth" value={form.dob} onChange={(v) => set('dob', v)} maximumDate={new Date()} clearable />
          </>
        )}
      </Card>

      {!editing && (
        <Card>
          <H>Membership</H>
          {role === 'tenant-admin' && !scopedBranch && (
            <Select label="Branch" value={form.branchId} placeholder="Choose a branch" onChange={(v) => { set('branchId', v); setFe((f) => ({ ...f, branch: '' })); }} options={branches.map((b) => ({ value: b._id, label: b.name }))} />
          )}
          <Select label="Plan" value={form.planId} placeholder="No plan yet" clearLabel="No plan yet" onChange={(v) => set('planId', v)} options={plans.map((p) => ({ value: p._id, label: `${p.name} (${rupees(p.price)})` }))} />
          {plan && (
            <>
              <DateField label="Start date" value={form.start} onChange={(v) => set('start', v)} />
              <Field label="Discount (%)" value={form.discount} onChangeText={(v) => set('discount', v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="0" hint={`To collect: ${rupees(amount)}`} />
            </>
          )}
        </Card>
      )}

      {can('features:trainerAssignment') && (
        <Card>
          <H>Trainer</H>
          <Select label="Assigned trainer" value={form.trainerId} placeholder="None" clearLabel="None" onChange={(v) => set('trainerId', v)} options={trainers.map((t) => ({ value: t._id, label: t.name, hint: t.specialization }))} />
        </Card>
      )}

      {personal && (
        <Card>
          <H>Emergency contact</H>
          <Field label="Name" value={form.emergencyName} onChangeText={(v) => set('emergencyName', v)} />
          <Field label="Phone" value={form.emergencyPhone} onChangeText={(v) => set('emergencyPhone', v)} keyboardType="phone-pad" />
        </Card>
      )}

      <View style={{ height: 4 }} />
      <Button title={editing ? 'Save changes' : plan ? 'Add member and take payment' : 'Add member'} onPress={submit} busy={saving} />
    </Screen>
  );
}
