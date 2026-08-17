import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../../context/AuthContext';
import { useFeature } from '../../hooks/useFeature';
import { membersAPI, branchesAPI, membershipPlansAPI, paymentsAPI, staffAPI, tenantSettingsAPI } from '../../services/api';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import BulkUploadMembersModal from '../../components/BulkUploadMembersModal';
import PaymentReceipt from '../../components/PaymentReceipt';
import RenewMembershipModal from '../../components/RenewMembershipModal';
import { buildUpiLink } from '../../utils/upi';

const todayStr = () => new Date().toISOString().slice(0, 10);

const DURATION_MONTHS = { monthly: 1, quarterly: 3, half_yearly: 6, yearly: 12 };

const getEmptyForm = () => ({
  name: '', email: '', phone: '', dob: '', gender: '', branchId: '',
  membershipPlanId: '', membershipStart: todayStr(), discountPercent: '', assignedTrainerId: '', paymentMethod: 'cash',
  amount: '', emergencyContactName: '', emergencyContactPhone: '',
});

// Server messages are the useful ones here (duplicate email, plan not found, field-level
// validation), so surface those and only fall back to a generic line.
const errorMessage = (err) => err?.response?.data?.message || err?.message || 'Something went wrong. Please try again.';

// No membershipPlanId here — changing plans is a renewal (RenewMembershipModal), not a
// plain edit, since a plan change also has to move membershipEnd and record a payment.
const emptyEditForm = {
  name: '', phone: '', email: '', dob: '', gender: '', membershipStatus: 'active', isActive: true, assignedTrainerId: '',
};

const inputClass = 'border rounded px-2 py-1 dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100';

// "in 5 days" / "today" / "12 days ago" — the filter is only useful if the list shows
// how close each membership actually is to lapsing.
const expiryLabel = (end) => {
  if (!end) return '—';
  const days = Math.ceil((new Date(end) - new Date()) / (24 * 60 * 60 * 1000));
  if (days === 0) return 'today';
  if (days < 0) return `${Math.abs(days)} day${days === -1 ? '' : 's'} ago`;
  return `in ${days} day${days === 1 ? '' : 's'}`;
};

export default function Members() {
  const { user } = useAuth();
  const isTenantAdmin = user.role === 'tenant-admin';
  const canBulkUpload = useFeature('features:bulkUpload');
  const canUseUpi = useFeature('features:upiPayments');
  const canAssignTrainer = useFeature('features:trainerAssignment');
  const canShowPersonalDetails = useFeature('fields:memberPersonalDetails');
  const [searchParams] = useSearchParams();
  const urlBranchId = searchParams.get('branchId');
  const [members, setMembers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [plans, setPlans] = useState([]);
  const [trainers, setTrainers] = useState([]);
  const [branchFilter, setBranchFilter] = useState(urlBranchId || '');
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [expiringFilter, setExpiringFilter] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [form, setForm] = useState(getEmptyForm);
  // Add Member modal steps: 'form' -> (UPI only) 'upi' QR/confirm -> 'receipt'.
  const [addStep, setAddStep] = useState('form');
  const [upiSettings, setUpiSettings] = useState({ name: '', upiId: '', upiPaymentLink: '' });
  const [createdMember, setCreatedMember] = useState(null);
  const [lastPayment, setLastPayment] = useState(null);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [showOptional, setShowOptional] = useState(false);
  const [renewingMember, setRenewingMember] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editingBranchId, setEditingBranchId] = useState('');
  const [editForm, setEditForm] = useState(emptyEditForm);

  const selectedPlan = plans.find((p) => p._id === form.membershipPlanId);
  const computedEndDate = useMemo(() => {
    if (!selectedPlan || !form.membershipStart) return '';
    const end = new Date(form.membershipStart);
    end.setMonth(end.getMonth() + DURATION_MONTHS[selectedPlan.durationUnit]);
    return end.toISOString().slice(0, 10);
  }, [selectedPlan, form.membershipStart]);
  const computedAmount = useMemo(() => {
    if (!selectedPlan) return 0;
    const discount = Number(form.discountPercent) || 0;
    return Math.round(selectedPlan.price * (1 - discount / 100));
  }, [selectedPlan, form.discountPercent]);
  // The amount charged is editable — staff can override the plan-price-minus-discount
  // figure (part payment, negotiated rate, rounding). Picking a different plan or
  // changing the discount recalculates it, deliberately discarding a manual override.
  useEffect(() => { setForm((f) => ({ ...f, amount: String(computedAmount) })); }, [computedAmount]);
  const finalAmount = Number(form.amount) || 0;

  useEffect(() => { if (urlBranchId) setBranchFilter(urlBranchId); }, [urlBranchId]);

  const load = () => {
    const params = {};
    if (isTenantAdmin && branchFilter) params.branchId = branchFilter;
    if (statusFilter) params.membershipStatus = statusFilter;
    if (planFilter) params.membershipPlanId = planFilter;
    if (expiringFilter) params.expiringInDays = expiringFilter;
    if (showInactive) params.includeInactive = 'true';
    return membersAPI.list(params).then((res) => setMembers(res.data.members));
  };
  useEffect(() => {
    if (isTenantAdmin) branchesAPI.list().then((res) => setBranches(res.data));
    membershipPlansAPI.list().then((res) => setPlans(res.data));
    // Tenant-wide for tenant-admin, own-branch-only for branch-manager — already scoped
    // correctly server-side (backend/controllers/staffController.js list).
    staffAPI.list({ role: 'trainer' }).then((res) => setTrainers(res.data));
    tenantSettingsAPI.get().then((res) => setUpiSettings(res.data));
  }, []);
  useEffect(() => { load(); }, [branchFilter, statusFilter, planFilter, expiringFilter, showInactive]);

  const branchName = (id) => branches.find((b) => b._id === id)?.name || id;
  const planName = (id) => plans.find((p) => p._id === id)?.name;
  // Only tenant-admin needs filtering by branch (their trainers list spans the whole
  // tenant); a branch-manager's fetched trainers are already all one branch.
  const trainersForBranch = (branchId) => (isTenantAdmin ? trainers.filter((t) => t.branchId === branchId) : trainers);

  const clearFilters = () => { setBranchFilter(''); setStatusFilter(''); setPlanFilter(''); setExpiringFilter(''); setShowInactive(false); };

  const openAddModal = () => {
    setForm({ ...getEmptyForm(), branchId: branchFilter || '' });
    setAddStep('form');
    setCreatedMember(null);
    setLastPayment(null);
    setFormError('');
    setShowOptional(false);
    setShowAddModal(true);
  };
  const closeAddModal = () => {
    setShowAddModal(false);
    setAddStep('form');
    setCreatedMember(null);
    setLastPayment(null);
    setFormError('');
  };

  const buildMemberPayload = () => {
    const { emergencyContactName, emergencyContactPhone, ...rest } = form;
    return {
      ...rest,
      membershipPlanId: form.membershipPlanId || undefined,
      assignedTrainerId: form.assignedTrainerId || null,
      emergencyContact: emergencyContactName || emergencyContactPhone
        ? { name: emergencyContactName, phone: emergencyContactPhone }
        : undefined,
    };
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (saving) return; // a double-click would otherwise create the member twice
    setSaving(true);
    setFormError('');
    try {
      const { data: member } = await membersAPI.create(buildMemberPayload());

      if (form.membershipPlanId && form.paymentMethod === 'upi') {
        // Member is created up front; the payment itself is recorded only once staff
        // confirms receipt in the UPI step below (no gateway callback to verify against).
        setCreatedMember(member);
        setAddStep('upi');
        return;
      }
      if (form.membershipPlanId) {
        const { data: payment } = await paymentsAPI.create({
          memberId: member._id,
          membershipPlanId: form.membershipPlanId,
          amount: finalAmount,
          method: 'cash',
          status: 'paid',
        });
        setCreatedMember(member);
        setLastPayment(payment);
        setAddStep('receipt');
        return;
      }
      setShowAddModal(false);
      load();
    } catch (err) {
      // Previously this rejection was swallowed: a duplicate email or a validation
      // failure left the modal sitting there with no explanation.
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleMarkUpiPaid = async () => {
    setMarkingPaid(true);
    setFormError('');
    try {
      const { data: payment } = await paymentsAPI.create({
        memberId: createdMember._id,
        membershipPlanId: form.membershipPlanId,
        amount: finalAmount,
        method: 'upi',
        status: 'paid',
      });
      setLastPayment(payment);
      setAddStep('receipt');
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setMarkingPaid(false);
    }
  };

  // Walking away from the QR used to leave nothing behind — the member existed, the
  // money didn't, and nobody knew to chase it. A pending payment makes the debt visible
  // on the Payments page, where it can be settled with Mark Paid.
  const handleUpiPayLater = async () => {
    setMarkingPaid(true);
    setFormError('');
    try {
      await paymentsAPI.create({
        memberId: createdMember._id,
        membershipPlanId: form.membershipPlanId,
        amount: finalAmount,
        method: 'upi',
        status: 'pending',
      });
      closeAddModal();
      load();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setMarkingPaid(false);
    }
  };

  const handleDoneAfterPayment = () => {
    setShowAddModal(false);
    setAddStep('form');
    setCreatedMember(null);
    setLastPayment(null);
    load();
  };

  const startEdit = (member) => {
    setEditingId(member._id);
    setEditingBranchId(member.branchId);
    setEditForm({
      name: member.name,
      phone: member.phone,
      email: member.email || '',
      dob: member.dob ? member.dob.slice(0, 10) : '',
      gender: member.gender || '',
      membershipStatus: member.membershipStatus,
      isActive: member.isActive,
      assignedTrainerId: member.assignedTrainerId || '',
    });
  };

  const cancelEdit = () => { setEditingId(null); setEditingBranchId(''); setEditForm(emptyEditForm); };

  const handleUpdate = async (e) => {
    e.preventDefault();
    await membersAPI.update(editingId, {
      ...editForm,
      email: editForm.email || undefined,
      gender: editForm.gender || undefined,
      assignedTrainerId: editForm.assignedTrainerId || null,
    });
    cancelEdit();
    load();
  };

  const handleDeactivate = async (member) => {
    if (!window.confirm(`Deactivate "${member.name}"? They'll no longer be able to check in or log in.`)) return;
    await membersAPI.remove(member._id);
    load();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Members</h1>
        <div className="flex gap-2">
          {canBulkUpload && (
            <button onClick={() => setShowBulkModal(true)} className="border rounded px-4 py-2 dark:border-gray-600 dark:text-gray-100">
              Bulk Upload
            </button>
          )}
          <button onClick={openAddModal} className="bg-gray-900 text-white rounded px-4 py-2 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white">
            + Add Member
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow flex flex-wrap gap-3 items-end">
        {isTenantAdmin && (
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Branch</label>
            <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className={inputClass}>
              <option value="">All branches</option>
              {branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputClass}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="frozen">Frozen</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Plan</label>
          <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} className={inputClass}>
            <option value="">All plans</option>
            {plans.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Expiry</label>
          <select value={expiringFilter} onChange={(e) => setExpiringFilter(e.target.value)} className={inputClass}>
            <option value="">Any expiry</option>
            <option value="7">Expiring in 7 days</option>
            <option value="15">Expiring in 15 days</option>
            <option value="30">Expiring in 30 days</option>
            <option value="60">Expiring in 60 days</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 pb-1">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show deactivated
        </label>
        {(branchFilter || statusFilter || planFilter || expiringFilter || showInactive) && (
          <button onClick={clearFilters} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">Clear filters</button>
        )}
      </div>

      <Modal open={showAddModal} onClose={closeAddModal} title="Add Member">
        {formError && (
          <div className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            {formError}
          </div>
        )}

        {addStep === 'form' && (
        <form onSubmit={handleCreate} className="flex flex-col gap-3">
          {isTenantAdmin && (
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Branch</label>
              <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} required className={`${inputClass} w-full`}>
                <option value="" disabled>Select branch</option>
                {branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Name</label>
            <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className={`${inputClass} w-full`} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Phone</label>
              <input
                type="tel"
                inputMode="numeric"
                pattern="[0-9+\-\s]{6,15}"
                title="6-15 digits"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                required
                className={`${inputClass} w-full`}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Email (optional)</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={`${inputClass} w-full`} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Membership Plan</label>
            <select
              value={form.membershipPlanId}
              onChange={(e) => setForm({ ...form, membershipPlanId: e.target.value, discountPercent: '' })}
              className={`${inputClass} w-full`}
            >
              <option value="">No plan yet</option>
              {plans.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
          </div>
          {canAssignTrainer && (
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Trainer (optional)</label>
              <select
                value={form.assignedTrainerId}
                onChange={(e) => setForm({ ...form, assignedTrainerId: e.target.value })}
                disabled={isTenantAdmin && !form.branchId}
                className={`${inputClass} w-full disabled:opacity-60`}
              >
                <option value="">No trainer assigned</option>
                {trainersForBranch(form.branchId).map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
              </select>
              {/* The list is branch-specific, so it's empty until a branch is chosen —
                  say so rather than showing a mysteriously empty dropdown. */}
              {isTenantAdmin && !form.branchId && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Pick a branch first to see its trainers.</p>
              )}
              {isTenantAdmin && form.branchId && trainersForBranch(form.branchId).length === 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">This branch has no trainers yet.</p>
              )}
            </div>
          )}
          {/* Collapsed by default so the common path stays short. These map to real
              Member fields (dob/gender/emergencyContact) that the API already stored but
              the form never collected. */}
          {canShowPersonalDetails && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-2">
            <button
              type="button"
              onClick={() => setShowOptional((v) => !v)}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              {showOptional ? '− Hide' : '+ Add'} personal & emergency details
            </button>
          </div>
          )}
          {canShowPersonalDetails && showOptional && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Date of Birth</label>
                <input type="date" max={todayStr()} value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} className={`${inputClass} w-full`} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Gender</label>
                <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className={`${inputClass} w-full`}>
                  <option value="">—</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                  <option value="prefer_not_say">Prefer not to say</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Emergency Contact</label>
                <input
                  placeholder="Name"
                  value={form.emergencyContactName}
                  onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })}
                  className={`${inputClass} w-full`}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Emergency Phone</label>
                <input
                  type="tel"
                  placeholder="Phone"
                  value={form.emergencyContactPhone}
                  onChange={(e) => setForm({ ...form, emergencyContactPhone: e.target.value })}
                  className={`${inputClass} w-full`}
                />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Start Date</label>
              <input type="date" value={form.membershipStart} onChange={(e) => setForm({ ...form, membershipStart: e.target.value })} className={`${inputClass} w-full`} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">End Date</label>
              <input type="date" value={computedEndDate} disabled className={`${inputClass} w-full opacity-70 cursor-not-allowed`} title="Calculated from the plan's duration, based on real calendar dates" />
            </div>
          </div>
          {form.membershipPlanId && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Discount %</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  placeholder="0"
                  value={form.discountPercent}
                  onChange={(e) => setForm({ ...form, discountPercent: e.target.value })}
                  className={`${inputClass} w-full`}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Final Amount</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className={`${inputClass} w-full`}
                />
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 col-span-2">
                Plan price ₹{selectedPlan?.price}{Number(form.discountPercent) > 0 ? ` minus ${form.discountPercent}% discount` : ''} = ₹{computedAmount}.
                {finalAmount !== computedAmount && ` Overridden to ₹${finalAmount}.`} Edit the amount to charge something else — this is what gets recorded and shown on the receipt.
              </p>
            </div>
          )}
          {form.membershipPlanId && (
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Payment Method</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                  <input
                    type="radio"
                    name="paymentMethod"
                    checked={form.paymentMethod === 'cash'}
                    onChange={() => setForm({ ...form, paymentMethod: 'cash' })}
                  />
                  Cash
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                  <input
                    type="radio"
                    name="paymentMethod"
                    checked={form.paymentMethod === 'upi'}
                    disabled={!upiSettings.upiId || !canUseUpi}
                    onChange={() => setForm({ ...form, paymentMethod: 'upi' })}
                  />
                  UPI {!canUseUpi ? '(not available on your plan)' : !upiSettings.upiId && '(configure in Payment Settings first)'}
                </label>
              </div>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={saving} className="bg-gray-900 text-white rounded px-4 py-2 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white disabled:opacity-50">
              {saving ? 'Saving...' : form.membershipPlanId && form.paymentMethod === 'upi' ? 'Pay Now' : 'Save Member'}
            </button>
            <button type="button" onClick={closeAddModal} className="border rounded px-4 py-2 dark:border-gray-600 dark:text-gray-100">Cancel</button>
          </div>
        </form>
        )}

        {addStep === 'upi' && createdMember && (
          <div className="flex flex-col items-center gap-4 text-center py-2">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Have {createdMember.name} scan and pay <span className="font-semibold">₹{finalAmount}</span>, then confirm below.
            </p>
            <div className="bg-white p-3 rounded border dark:border-gray-600">
              <QRCodeSVG
                value={buildUpiLink({
                  upiId: upiSettings.upiId,
                  payeeName: upiSettings.name,
                  amount: finalAmount,
                  note: `${createdMember.name} - ${selectedPlan?.name || 'Membership'}`,
                })}
                size={180}
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">UPI ID: <span className="font-mono">{upiSettings.upiId}</span></p>
            {upiSettings.upiPaymentLink && (
              <a href={upiSettings.upiPaymentLink} target="_blank" rel="noreferrer" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                Or open payment link
              </a>
            )}
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleMarkUpiPaid}
                disabled={markingPaid}
                className="bg-gray-900 text-white rounded px-4 py-2 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white disabled:opacity-50"
              >
                {markingPaid ? 'Confirming...' : 'Mark as Paid'}
              </button>
              <button type="button" onClick={handleUpiPayLater} disabled={markingPaid} className="border rounded px-4 py-2 dark:border-gray-600 dark:text-gray-100 disabled:opacity-50">
                Pay later
              </button>
            </div>
          </div>
        )}

        {addStep === 'receipt' && createdMember && lastPayment && (
          <div className="flex flex-col items-center gap-3 text-center py-2">
            <div className="text-green-600 dark:text-green-400 text-3xl">✓</div>
            <p className="text-gray-900 dark:text-gray-100 font-medium">Payment recorded</p>
            <PaymentReceipt
              tenantName={upiSettings.name}
              member={createdMember}
              planName={selectedPlan?.name}
              amount={lastPayment.amount}
              method={lastPayment.method}
              invoiceNumber={lastPayment.invoiceNumber}
              paidAt={lastPayment.paidAt}
            />
            <button onClick={handleDoneAfterPayment} className="bg-gray-900 text-white rounded px-4 py-2 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white mt-2">
              Done
            </button>
          </div>
        )}
      </Modal>

      <RenewMembershipModal
        open={!!renewingMember}
        member={renewingMember}
        onClose={() => setRenewingMember(null)}
        onRenewed={load}
      />

      <BulkUploadMembersModal
        open={showBulkModal}
        onClose={() => setShowBulkModal(false)}
        branches={branches}
        plans={plans}
        onImported={load}
        fixedBranchId={isTenantAdmin ? undefined : user.branchId}
      />

      {editingId && (
        <form onSubmit={handleUpdate} className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow space-y-3 border-2 border-gray-900 dark:border-gray-100">
          <div className="text-sm text-gray-500 dark:text-gray-400">Editing member</div>
          <div className="flex flex-wrap gap-3 items-end">
            <input placeholder="Name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required className={inputClass} />
            <input placeholder="Phone" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} required className={inputClass} />
            <input placeholder="Email" type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className={inputClass} />
            <input placeholder="DOB" type="date" value={editForm.dob} onChange={(e) => setEditForm({ ...editForm, dob: e.target.value })} className={inputClass} />
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Gender</label>
              <select value={editForm.gender} onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })} className={inputClass}>
                <option value="">—</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
                <option value="prefer_not_say">Prefer not to say</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Status</label>
              <select value={editForm.membershipStatus} onChange={(e) => setEditForm({ ...editForm, membershipStatus: e.target.value })} className={inputClass}>
                <option value="active">Active</option>
                <option value="expired">Expired</option>
                <option value="frozen">Frozen</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            {canAssignTrainer && (
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Trainer (optional)</label>
                <select value={editForm.assignedTrainerId} onChange={(e) => setEditForm({ ...editForm, assignedTrainerId: e.target.value })} className={inputClass}>
                  <option value="">No trainer assigned</option>
                  {trainersForBranch(editingBranchId).map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
                </select>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <input type="checkbox" checked={editForm.isActive} onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })} />
              Active
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="bg-gray-900 text-white rounded px-4 py-2 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white">Save Changes</button>
            <button type="button" onClick={cancelEdit} className="border rounded px-4 py-2 dark:border-gray-600 dark:text-gray-100">Cancel</button>
          </div>
        </form>
      )}

      <DataTable
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'phone', label: 'Phone' },
          ...(isTenantAdmin ? [{ key: 'branch', label: 'Branch', render: (r) => branchName(r.branchId), hideOnMobile: true }] : []),
          { key: 'plan', label: 'Plan', render: (r) => (r.membershipPlanId ? planName(r.membershipPlanId) || '—' : '—') },
          {
            key: 'planEndDate',
            label: 'Plan End Date',
            render: (r) => (r.membershipEnd ? new Date(r.membershipEnd).toLocaleDateString() : '—'),
          },
          {
            key: 'expires',
            label: 'Expires',
            render: (r) => (
              <span className={r.membershipEnd && new Date(r.membershipEnd) < new Date() ? 'text-red-600 dark:text-red-400' : ''}>
                {expiryLabel(r.membershipEnd)}
              </span>
            ),
          },
          {
            key: 'actions',
            label: 'Actions',
            render: (row) => (
              <div className="flex gap-2">
                <button onClick={() => setRenewingMember(row)} className="text-green-700 dark:text-green-400 hover:underline">
                  {row.membershipPlanId ? 'Renew' : 'Add Plan'}
                </button>
                <button onClick={() => startEdit(row)} className="text-blue-600 dark:text-blue-400 hover:underline">Edit</button>
                <button
                  onClick={() => handleDeactivate(row)}
                  disabled={!row.isActive}
                  className="text-red-600 dark:text-red-400 hover:underline disabled:text-gray-300 dark:disabled:text-gray-600 disabled:no-underline disabled:cursor-not-allowed"
                >
                  {row.isActive ? 'Deactivate' : 'Inactive'}
                </button>
              </div>
            ),
          },
        ]}
        rows={members}
      />
    </div>
  );
}
