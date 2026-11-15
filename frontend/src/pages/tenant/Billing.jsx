import { useCallback, useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Copy, ExternalLink, Smartphone } from 'lucide-react';
import { billingAPI } from '../../services/api';
import { fieldClass, primaryBtn, toolBtn } from '../../components/ListToolbar';
import { receiptJpegBase64 } from '../../utils/photo';
import { fmtRupees } from '../../utils/receipt';

const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL;
const errorMessage = (err) => err?.response?.data?.message || err?.message || 'Something went wrong. Please try again.';
const date = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const periodLabel = (months) => (months === 1 ? 'month' : months === 12 ? 'year' : months === 3 ? '3 months' : months === 6 ? '6 months' : `${months} months`);
const STATUS = {
  created: ['Not paid yet', 'text-amber-700 dark:text-amber-400'],
  awaiting_confirmation: ['Waiting for confirmation', 'text-blue-700 dark:text-blue-300'],
  paid: ['Paid', 'text-green-700 dark:text-accent'],
  rejected: ['Not confirmed', 'text-red-700 dark:text-red-400'],
  expired: ['Expired', 'text-gray-500'],
  cancelled: ['Cancelled', 'text-gray-500'],
};

const Card = ({ children, className = '' }) => <section className={`rounded-3xl border border-gray-200/80 bg-white p-4 shadow-sm dark:border-white/5 dark:bg-gray-800/80 ${className}`}>{children}</section>;

function Usage({ label, used, max }) {
  const pct = max ? Math.min(100, Math.round((used / max) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400"><span>{label}</span><span>{used}{max ? ` of ${max}` : ' (no limit)'}</span></div>
      {max ? <div className="mt-1 h-1.5 rounded-full bg-gray-100 dark:bg-white/10"><div className={`h-1.5 rounded-full ${pct >= 90 ? 'bg-red-500' : 'bg-accent'}`} style={{ width: `${Math.max(3, pct)}%` }} /></div> : null}
    </div>
  );
}

// The payment itself: the QR, what to pay, and the "I have paid" form.
function Payment({ order, onChange }) {
  const [utr, setUtr] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const waiting = order.status === 'awaiting_confirmation';

  const copy = async () => { try { await navigator.clipboard.writeText(order.reference); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ } };
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await billingAPI.submit(order._id, { utr: utr.trim(), ...(file ? { image: await receiptJpegBase64(file) } : {}) });
      onChange();
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };
  const cancel = async () => { setBusy(true); try { await billingAPI.cancel(order._id); } catch { /* already handled */ } onChange(); };

  return (
    <Card className="border-accent/40">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{waiting ? 'We are checking your payment' : `Pay ${fmtRupees(order.total)} for ${order.packageName}`}</h2>
      {waiting ? (
        <div className="mt-2 space-y-2 text-sm text-gray-700 dark:text-gray-300">
          <p>You sent transaction number <strong>{order.utr}</strong> for {fmtRupees(order.total)}. Our team confirms payments by checking the bank, usually within one working day. You will get an email as soon as it is done, and your plan switches on automatically.</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Reference {order.reference}. Questions? {SUPPORT_EMAIL ? <a className="underline" href={`mailto:${SUPPORT_EMAIL}?subject=Payment ${order.reference}`}>{SUPPORT_EMAIL}</a> : 'Contact us'} and quote the reference.</p>
        </div>
      ) : (
        <div className="mt-3 grid gap-5 md:grid-cols-[auto,1fr]">
          <div className="mx-auto md:mx-0">
            <div className="rounded-2xl bg-white p-3"><QRCodeSVG value={order.payment.upiLink} size={180} /></div>
            <a href={order.payment.upiLink} className="mt-2 flex items-center justify-center gap-1.5 text-sm font-semibold text-green-700 underline dark:text-accent md:hidden"><Smartphone className="h-4 w-4" /> Open in my UPI app</a>
          </div>
          <div className="space-y-4">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-700 dark:text-gray-300">
              <li>Scan the QR with any UPI app. The amount and reference are filled in.</li>
              <li>Pay exactly <strong>{fmtRupees(order.total)}</strong> to <strong>{order.payment.payeeName || order.payment.upiId}</strong> ({order.payment.upiId}).</li>
              <li>Keep the reference below in the payment note.</li>
              <li>Enter the 12-digit transaction number (UTR) your app shows, and tap "I have paid".</li>
            </ol>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-2xl bg-gray-50 p-3 text-sm dark:bg-white/5">
              <dt className="text-gray-500 dark:text-gray-400">Price</dt><dd className="text-right">{fmtRupees(order.amount)}</dd>
              {order.gstAmount > 0 && (<><dt className="text-gray-500 dark:text-gray-400">GST ({order.gstPercent}%)</dt><dd className="text-right">{fmtRupees(order.gstAmount)}</dd></>)}
              <dt className="font-semibold">To pay</dt><dd className="text-right font-semibold">{fmtRupees(order.total)}</dd>
              <dt className="text-gray-500 dark:text-gray-400">Reference</dt>
              <dd className="flex items-center justify-end gap-1.5 font-mono">{order.reference}<button type="button" onClick={copy} aria-label="Copy reference" className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-100">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button></dd>
            </dl>
            {order.losesDays > 0 && <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">Switching package starts a new period today. The {order.losesDays} day{order.losesDays === 1 ? '' : 's'} left on your current plan will not carry over.</p>}
            <form onSubmit={submit} className="space-y-3">
              {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
              <div>
                <label htmlFor="bl-utr" className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Transaction number (UTR), 12 digits</label>
                <input id="bl-utr" inputMode="numeric" pattern="\d{12}" maxLength={12} required value={utr} onChange={(e) => setUtr(e.target.value.replace(/\D/g, ''))} placeholder="123456789012" className={`${fieldClass} font-mono`} />
              </div>
              <div>
                <label htmlFor="bl-shot" className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Screenshot of the payment (optional, helps us confirm faster)</label>
                <input id="bl-shot" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full text-sm text-gray-600 dark:text-gray-300" />
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={busy || utr.length !== 12} className={primaryBtn}>{busy ? 'Sending...' : 'I have paid'}</button>
                <button type="button" onClick={cancel} disabled={busy} className={toolBtn}>Choose a different plan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function Billing() {
  const [data, setData] = useState(null);
  const [periods, setPeriods] = useState({}); // package id -> number of periods
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => billingAPI.overview().then((r) => setData(r.data)).catch((err) => setError(errorMessage(err))), []);
  useEffect(() => { load(); }, [load]);

  const choose = async (pkg) => {
    setBusy(pkg._id);
    setError('');
    try { await billingAPI.createOrder(pkg._id, periods[pkg._id] || 1); await load(); window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (err) { setError(errorMessage(err)); } finally { setBusy(''); }
  };
  const viewProof = async (o) => { try { const res = await billingAPI.proof(o._id); window.open(URL.createObjectURL(res.data), '_blank', 'noopener'); } catch (err) { setError(errorMessage(err)); } };

  if (!data) return <div className="p-6 text-gray-500 dark:text-gray-400">{error || 'Loading...'}</div>;
  const s = data.subscription;
  const pending = data.openOrder?.status === 'awaiting_confirmation';
  const unitTotal = (p) => { const base = p.price * (periods[p._id] || 1); return base + Math.round(base * data.payment.gstPercent) / 100; };

  let headline; let detail;
  if (s.onTrial) { headline = s.trialExpired ? 'Your free trial has ended' : `Free trial: ${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'} left`; detail = s.trialExpired ? 'Your data is safe and you can still view it. Choose a plan to continue.' : `Ends ${date(s.trialEndsAt)}. Choose a plan below to carry on without a break.`; }
  else if (s.planEndsAt) { headline = `${s.packageName || 'Your plan'}${s.planExpired ? ' has ended' : ` is active until ${date(s.planEndsAt)}`}`; detail = s.planExpired ? (s.planLocked ? 'Renew to continue making changes.' : `Everything works for ${s.graceDays} more days. Renew to avoid a pause.`) : `${s.planDaysLeft} day${s.planDaysLeft === 1 ? '' : 's'} left.`; }
  else { headline = s.packageName || 'Your plan'; detail = 'No end date.'; }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Billing</h1>
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Current plan</p>
            <p className="mt-1 text-xl font-extrabold text-gray-900 dark:text-white">{headline}</p>
            <p className="text-sm text-gray-600 dark:text-gray-300">{detail}</p>
          </div>
          <div className="w-full space-y-3 sm:w-64"><Usage label="Members" used={data.usage.members} max={s.maxMembers} /><Usage label="Branches" used={data.usage.branches} max={s.maxBranches} /></div>
        </div>
      </Card>

      {!data.payment.enabled && <p className="rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">Paying here is not switched on yet. {SUPPORT_EMAIL ? <>Email <a className="underline" href={`mailto:${SUPPORT_EMAIL}?subject=Choose a plan`}>{SUPPORT_EMAIL}</a> to choose a plan.</> : 'Please contact us to choose a plan.'}</p>}

      {data.openOrder && <Payment order={data.openOrder} onChange={load} />}

      <div>
        <h2 className="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100">{s.onTrial ? 'Choose a plan' : 'Plans'}</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.packages.map((p) => (
            <Card key={p._id} className={p.isFeatured ? 'ring-2 ring-accent/60' : ''}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{p.name}</h3>
                {p.current && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-green-700 dark:text-accent">Your plan</span>}
              </div>
              {p.description && <p className="text-sm text-gray-600 dark:text-gray-300">{p.description}</p>}
              <p className="mt-2 text-2xl font-extrabold text-gray-900 dark:text-white">{p.price > 0 ? fmtRupees(p.price) : 'Free'}{p.price > 0 && <span className="text-sm font-medium text-gray-500 dark:text-gray-400"> / {periodLabel(p.billingMonths)}</span>}</p>
              <ul className="mt-2 space-y-0.5 text-sm text-gray-700 dark:text-gray-300">
                <li>{p.maxBranches} branch{p.maxBranches === 1 ? '' : 'es'}</li>
                <li>{p.maxMembers ? `Up to ${p.maxMembers} members` : 'Unlimited members'}</li>
                {p.highlights.map((h) => <li key={h}>{h}</li>)}
              </ul>
              {p.selectable ? (
                <div className="mt-3 space-y-2">
                  {p.maxPeriods > 1 && (
                    <div className="flex items-center gap-2 text-sm">
                      <label htmlFor={`per-${p._id}`} className="text-gray-500 dark:text-gray-400">Pay for</label>
                      <select id={`per-${p._id}`} value={periods[p._id] || 1} onChange={(e) => setPeriods({ ...periods, [p._id]: Number(e.target.value) })} className={`${fieldClass} !w-auto`}>
                        {Array.from({ length: p.maxPeriods }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{periodLabel(p.billingMonths * n)}</option>)}
                      </select>
                    </div>
                  )}
                  <button type="button" onClick={() => choose(p)} disabled={!data.payment.enabled || pending || busy === p._id} className={`${primaryBtn} w-full`}>
                    {busy === p._id ? 'One moment...' : `${p.current ? 'Renew' : s.onTrial ? 'Choose' : 'Switch to'} ${p.name} · ${fmtRupees(unitTotal(p))}`}
                  </button>
                  {data.payment.gstPercent > 0 && <p className="text-xs text-gray-500 dark:text-gray-400">Includes {data.payment.gstPercent}% GST.</p>}
                </div>
              ) : <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Arranged with us directly.{SUPPORT_EMAIL && <> <a className="underline" href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(p.name)}`}>Contact us</a></>}</p>}
            </Card>
          ))}
        </div>
      </div>

      {data.orders.length > 0 && (
        <Card>
          <h2 className="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100">Payment history</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400"><tr><th className="py-2 pr-3">Date</th><th className="pr-3">Plan</th><th className="pr-3">Amount</th><th className="pr-3">Reference</th><th>Status</th></tr></thead>
              <tbody>
                {data.orders.map((o) => (
                  <tr key={o._id} className="border-t border-gray-100 dark:border-white/5">
                    <td className="py-2 pr-3">{date(o.createdAt)}</td><td className="pr-3">{o.packageName}{o.periods > 1 ? ` × ${o.periods}` : ''}</td><td className="pr-3">{fmtRupees(o.total)}</td><td className="pr-3 font-mono text-xs">{o.reference}</td>
                    <td className={STATUS[o.status][1]}>{STATUS[o.status][0]}{o.status === 'rejected' && o.rejectReason ? `: ${o.rejectReason}` : ''}{o.hasProof && <button type="button" onClick={() => viewProof(o)} className="ml-2 inline-flex items-center gap-0.5 text-xs text-blue-600 underline dark:text-blue-400">proof <ExternalLink className="h-3 w-3" /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
