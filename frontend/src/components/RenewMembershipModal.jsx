import { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { membersAPI, membershipPlansAPI, tenantSettingsAPI } from '../services/api';
import Modal from './Modal';
import PaymentReceipt from './PaymentReceipt';
import { accountForBranch, buildUpiLink } from '../utils/upi';
import { useFeature } from '../hooks/useFeature';

const inputClass = 'border rounded px-2 py-1 dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : '—');

export default function RenewMembershipModal({ open, member, onClose, onRenewed }) {
  const canUseUpi = useFeature('features:upiPayments');
  const [plans, setPlans] = useState([]);
  const [upiSettings, setUpiSettings] = useState({ name: '', upiId: '', upiPaymentLink: '' });
  // 'form' -> (UPI only) 'upi' QR/confirm -> 'receipt'
  const [step, setStep] = useState('form');
  const [form, setForm] = useState({ membershipPlanId: '', discountPercent: '', amount: '', paymentMethod: 'cash' });
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);
  // The branch the member belongs to may have its own UPI account.
  const upi = accountForBranch(upiSettings, member?.branchId);

  useEffect(() => {
    if (!open) return;
    membershipPlansAPI.list().then((res) => setPlans(res.data));
    tenantSettingsAPI.get().then((res) => setUpiSettings(res.data));
  }, [open]);

  // Default to whatever plan the member is already on — renewing onto the same plan is
  // the common case; switching plans at renewal is the exception.
  useEffect(() => {
    if (!open) return;
    setStep('form');
    setResult(null);
    setForm({ membershipPlanId: member?.membershipPlanId || '', discountPercent: '', amount: '', paymentMethod: 'cash' });
  }, [open, member]);

  const selectedPlan = plans.find((p) => p._id === form.membershipPlanId);
  const computedAmount = useMemo(() => {
    if (!selectedPlan) return 0;
    const discount = Number(form.discountPercent) || 0;
    return Math.round(selectedPlan.price * (1 - discount / 100));
  }, [selectedPlan, form.discountPercent]);
  useEffect(() => { setForm((f) => ({ ...f, amount: String(computedAmount) })); }, [computedAmount]);
  const finalAmount = Number(form.amount) || 0;

  const hasPlan = !!member?.membershipPlanId;
  // Picking a different plan than the member is currently on is a correction/change,
  // not a top-up — mirrors the server's rule (memberController.js renew): it starts
  // today regardless of remaining time, so a wrong plan can actually be fixed instead of
  // just being queued up behind the mistaken one.
  const isPlanChange = hasPlan && !!form.membershipPlanId && form.membershipPlanId !== member.membershipPlanId;
  const currentPlanName = plans.find((p) => p._id === member?.membershipPlanId)?.name;

  // Mirrors the server's rule: same-plan renewal extends from the current expiry when
  // there's time left; a plan change or an already-lapsed membership starts today.
  const renewsFrom = useMemo(() => {
    const now = new Date();
    if (!isPlanChange && member?.membershipEnd && new Date(member.membershipEnd) > now) return new Date(member.membershipEnd);
    return now;
  }, [member, isPlanChange]);
  const isExpired = member?.membershipEnd ? new Date(member.membershipEnd) < new Date() : true;

  const doRenew = async (method) => {
    setSaving(true);
    try {
      const { data } = await membersAPI.renew(member._id, {
        membershipPlanId: form.membershipPlanId,
        amount: finalAmount,
        method,
      });
      setResult(data);
      setStep('receipt');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // UPI renewals only commit once staff confirm the money arrived — otherwise an
    // unpaid renewal would silently extend the membership.
    if (form.paymentMethod === 'upi') return setStep('upi');
    doRenew('cash');
  };

  const handleDone = () => {
    onRenewed?.();
    onClose();
  };

  if (!member) return null;

  return (
    <Modal open={open} onClose={onClose} title={`${!hasPlan ? 'Add Plan' : isPlanChange ? 'Change Plan' : 'Renew'} — ${member.name}`}>
      {step === 'form' && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {!hasPlan
              ? <>No active plan yet — first term starts today.</>
              : isPlanChange
              ? <>Switching from <span className="font-medium text-gray-700 dark:text-gray-200">{currentPlanName}</span> to <span className="font-medium text-gray-700 dark:text-gray-200">{selectedPlan?.name}</span> — starts today. Any remaining days on the current plan won't carry over.</>
              : isExpired
              ? <>Expired on <span className="font-medium text-gray-700 dark:text-gray-200">{fmtDate(member.membershipEnd)}</span> — new term starts today.</>
              : <>Active until <span className="font-medium text-gray-700 dark:text-gray-200">{fmtDate(member.membershipEnd)}</span> — remaining days are kept, new term starts then.</>}
          </div>

          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Plan</label>
            <select
              value={form.membershipPlanId}
              onChange={(e) => setForm({ ...form, membershipPlanId: e.target.value, discountPercent: '' })}
              required
              className={`${inputClass} w-full`}
            >
              <option value="" disabled>Select plan</option>
              {plans.map((p) => <option key={p._id} value={p._id}>{p.name} (₹{p.price})</option>)}
            </select>
          </div>

          {form.membershipPlanId && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Discount %</label>
                  <input
                    type="number" min="0" max="100" placeholder="0"
                    value={form.discountPercent}
                    onChange={(e) => setForm({ ...form, discountPercent: e.target.value })}
                    className={`${inputClass} w-full`}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Amount</label>
                  <input
                    type="number" min="0" required
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className={`${inputClass} w-full`}
                  />
                </div>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {hasPlan && !isPlanChange ? 'Renews from' : 'Starts'} {fmtDate(renewsFrom)} for one {selectedPlan?.durationUnit?.replace('_', ' ')} term.
                Plan price ₹{selectedPlan?.price}{Number(form.discountPercent) > 0 ? ` minus ${form.discountPercent}% discount` : ''} = ₹{computedAmount}.
                {finalAmount !== computedAmount && ` Overridden to ₹${finalAmount}.`}
              </p>

              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Payment Method</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                    <input type="radio" name="renewMethod" checked={form.paymentMethod === 'cash'} onChange={() => setForm({ ...form, paymentMethod: 'cash' })} />
                    Cash
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                    <input
                      type="radio" name="renewMethod"
                      checked={form.paymentMethod === 'upi'}
                      disabled={!upi.upiId || !canUseUpi}
                      onChange={() => setForm({ ...form, paymentMethod: 'upi' })}
                    />
                    UPI {!canUseUpi ? '(not available on your plan)' : !upi.upiId && '(configure in Payment Settings first)'}
                  </label>
                </div>
              </div>
            </>
          )}

          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={saving} className="bg-gray-900 text-white rounded px-4 py-2 dark:bg-accent dark:text-accent-ink dark:font-semibold dark:hover:bg-accent-hover disabled:opacity-50">
              {saving
                ? 'Saving...'
                : form.paymentMethod === 'upi'
                ? 'Pay Now'
                : !hasPlan
                ? 'Add Plan & Record Payment'
                : isPlanChange
                ? 'Change Plan & Record Payment'
                : 'Renew & Record Payment'}
            </button>
            <button type="button" onClick={onClose} className="border rounded px-4 py-2 dark:border-gray-600 dark:text-gray-100">Cancel</button>
          </div>
        </form>
      )}

      {step === 'upi' && (
        <div className="flex flex-col items-center gap-4 text-center py-2">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Have {member.name} scan and pay <span className="font-semibold">₹{finalAmount}</span>, then confirm below.
          </p>
          <div className="bg-white p-3 rounded border dark:border-gray-600">
            <QRCodeSVG
              value={buildUpiLink({
                upiId: upi.upiId,
                payeeName: upiSettings.name,
                amount: finalAmount,
                note: `${member.name} - ${selectedPlan?.name || 'Renewal'}`,
              })}
              size={180}
            />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">UPI ID: <span className="font-mono">{upi.upiId}</span></p>
          {upi.upiPaymentLink && (
            <a href={upi.upiPaymentLink} target="_blank" rel="noreferrer" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
              Or open payment link
            </a>
          )}
          <div className="flex gap-2 pt-2">
            <button onClick={() => doRenew('upi')} disabled={saving} className="bg-gray-900 text-white rounded px-4 py-2 dark:bg-accent dark:text-accent-ink dark:font-semibold dark:hover:bg-accent-hover disabled:opacity-50">
              {saving ? 'Confirming...' : 'Mark as Paid'}
            </button>
            <button type="button" onClick={onClose} className="border rounded px-4 py-2 dark:border-gray-600 dark:text-gray-100">
              {!hasPlan ? 'Close (not added)' : isPlanChange ? 'Close (not changed)' : 'Close (not renewed)'}
            </button>
          </div>
        </div>
      )}

      {step === 'receipt' && result && (
        <div className="flex flex-col items-center gap-3 text-center py-2">
          <div className="text-green-600 dark:text-green-400 text-3xl">✓</div>
          <p className="text-gray-900 dark:text-gray-100 font-medium">
            {!hasPlan ? 'Plan added' : isPlanChange ? 'Plan changed' : 'Renewed'} — active until {fmtDate(result.member.membershipEnd)}
          </p>
          <PaymentReceipt
            tenantName={upiSettings.name}
            member={member}
            planName={selectedPlan?.name}
            planDuration={selectedPlan?.durationUnit}
            discountPercent={form.discountPercent}
            period={{ start: result.member.membershipStart, end: result.member.membershipEnd }}
            amount={result.payment.amount}
            method={result.payment.method}
            invoiceNumber={result.payment.invoiceNumber}
            paidAt={result.payment.paidAt}
          />
          <button onClick={handleDone} className="bg-gray-900 text-white rounded px-4 py-2 dark:bg-accent dark:text-accent-ink dark:font-semibold dark:hover:bg-accent-hover mt-2">
            Done
          </button>
        </div>
      )}
    </Modal>
  );
}
