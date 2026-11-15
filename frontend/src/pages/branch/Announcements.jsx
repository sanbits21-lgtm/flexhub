import { useCallback, useEffect, useState } from 'react';
import { BellRing, Megaphone, Plus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { announcementsAPI, branchesAPI, membershipPlansAPI } from '../../services/api';
import Modal from '../../components/Modal';
import BranchPicker from '../../components/BranchPicker';
import { fieldClass, primaryBtn, toolBtn } from '../../components/ListToolbar';

const errorMessage = (err) => err?.response?.data?.message || err?.message || 'Something went wrong. Please try again.';
const KINDS = [['news', 'News'], ['offer', 'Offer'], ['notice', 'Notice']];
const AUDIENCES = [['everyone', 'All members'], ['active', 'Active members'], ['expiring', 'Memberships ending soon'], ['expired', 'Lapsed members'], ['plan', 'Members on one plan']];
const STAGE = {
  live: 'bg-green-600/10 text-green-700 dark:bg-accent/15 dark:text-accent',
  scheduled: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  ended: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
  withdrawn: 'bg-red-500/10 text-red-700 dark:text-red-400',
};
const DAY_CHOICES = [10, 7, 5, 3, 2, 1];
const emptyForm = () => ({ title: '', body: '', kind: 'news', branchIds: [], audienceType: 'everyone', days: 7, planId: '', startsAt: '', expiresAt: '', link: '' });
// <input type="datetime-local"> gives local time without a zone; turn it into a real moment.
const asDate = (v) => (v ? new Date(v).toISOString() : '');

export default function Announcements() {
  const { user } = useAuth();
  const admin = user.role === 'tenant-admin';
  const [items, setItems] = useState(null);
  const [branches, setBranches] = useState([]);
  const [plans, setPlans] = useState([]);
  const [editing, setEditing] = useState(null); // null = closed, 'new', or a notice
  const [form, setForm] = useState(emptyForm());
  const [reach, setReach] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reminders, setReminders] = useState(null);
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [remMsg, setRemMsg] = useState('');

  const load = useCallback(() => announcementsAPI.list().then((r) => setItems(r.data)), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (admin) branchesAPI.list().then((r) => setBranches(r.data));
    membershipPlansAPI.list().then((r) => setPlans((r.data.data || r.data).filter((p) => p.isActive)));
    if (admin) announcementsAPI.getReminders().then((r) => setReminders(r.data)).catch(() => {});
  }, [admin]);

  const audience = () => ({ type: form.audienceType, ...(form.audienceType === 'expiring' ? { days: Number(form.days) || 7 } : {}), ...(form.audienceType === 'plan' ? { planId: form.planId || null } : {}) });

  // "This will reach N members", refreshed a moment after the choices change.
  useEffect(() => {
    if (editing !== 'new') return undefined;
    if (form.audienceType === 'plan' && !form.planId) { setReach(null); return undefined; }
    const timer = setTimeout(() => {
      announcementsAPI.preview({ branchIds: form.branchIds, audience: audience() }).then((r) => setReach(r.data.count)).catch(() => setReach(null));
    }, 250);
    return () => clearTimeout(timer);
  }, [editing, form.branchIds, form.audienceType, form.days, form.planId]);

  const openNew = () => { setForm(emptyForm()); setReach(null); setError(''); setEditing('new'); };
  const openEdit = (n) => {
    setForm({ ...emptyForm(), title: n.title, body: n.body, kind: n.kind, link: n.link || '', expiresAt: n.expiresAt ? new Date(new Date(n.expiresAt) - new Date(n.expiresAt).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '' });
    setError('');
    setEditing(n);
  };

  const save = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      if (editing === 'new') {
        await announcementsAPI.create({
          title: form.title, body: form.body, kind: form.kind, branchIds: admin ? form.branchIds : undefined, audience: audience(),
          startsAt: asDate(form.startsAt) || undefined, expiresAt: asDate(form.expiresAt) || null, link: form.link,
        });
      } else {
        await announcementsAPI.update(editing._id, { title: form.title, body: form.body, kind: form.kind, link: form.link, expiresAt: asDate(form.expiresAt) || null });
      }
      setEditing(null);
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const withdraw = async (n) => {
    if (!window.confirm(`Withdraw "${n.title}"? Members will stop seeing it.`)) return;
    await announcementsAPI.withdraw(n._id);
    load();
  };

  const saveReminders = async (e) => {
    e.preventDefault();
    setRemMsg('');
    try {
      const { defaults, ...body } = reminders;
      setReminders((await announcementsAPI.putReminders(body)).data);
      setRemMsg('Saved.');
    } catch (err) {
      setRemMsg(errorMessage(err));
    }
  };
  const toggleDay = (d) => setReminders((r) => {
    const has = r.daysBefore.includes(d);
    const next = has ? r.daysBefore.filter((x) => x !== d) : [...r.daysBefore, d];
    return { ...r, daysBefore: next.sort((a, b) => b - a) };
  });

  const audienceText = (n) => {
    const a = n.audience || {};
    const base = { everyone: 'All members', active: 'Active members', expired: 'Lapsed members', expiring: `Ending within ${a.days || 7} days`, plan: `On ${plans.find((p) => p._id === a.planId)?.name || 'one plan'}` }[a.type] || 'All members';
    const where = n.branchIds?.length ? n.branchIds.map((id) => branches.find((b) => b._id === id)?.name || 'a branch').join(', ') : 'all branches';
    return `${base} · ${where}`;
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Announcements</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">News and offers your members read in their app.{!admin && ' You can publish to your own branch.'}</p>
        </div>
        <div className="flex gap-2">
          {admin && <button type="button" onClick={() => setRemindersOpen(true)} className={`${toolBtn} inline-flex items-center gap-1.5`}><BellRing className="h-4 w-4" /> Renewal reminders{reminders?.enabled ? ' (on)' : ''}</button>}
          <button type="button" onClick={openNew} className={`${primaryBtn} inline-flex items-center gap-1.5`}><Plus className="h-4 w-4" /> New announcement</button>
        </div>
      </div>

      {items === null ? <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Loading...</p> : items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-gray-300 p-8 text-center dark:border-gray-700">
          <Megaphone className="mx-auto h-8 w-8 text-gray-400" aria-hidden="true" />
          <p className="mt-2 font-medium text-gray-900 dark:text-gray-100">Nothing published yet</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">Tell members about a new class, an offer, or a holiday closing.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((n) => (
            <li key={n._id} className="rounded-3xl border border-gray-200/80 bg-white p-4 shadow-sm dark:border-white/5 dark:bg-gray-800/80">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-gray-900 dark:text-gray-100">{n.title}</h2>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STAGE[n.stage]}`}>{n.stage}</span>
                    <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{n.kind}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-line text-sm text-gray-700 dark:text-gray-300">{n.body}</p>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{audienceText(n)} · reaches {n.reach} · read by {n.readCount} · {n.createdByName || 'Staff'}, {new Date(n.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}{n.startsAt && new Date(n.startsAt) > new Date() ? ` · starts ${new Date(n.startsAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}{n.expiresAt ? ` · ends ${new Date(n.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}</p>
                </div>
                {n.canManage && n.status !== 'withdrawn' && (
                  <div className="flex gap-3 text-sm">
                    <button type="button" onClick={() => openEdit(n)} className="text-blue-600 hover:underline dark:text-blue-400">Edit</button>
                    <button type="button" onClick={() => withdraw(n)} className="text-red-600 hover:underline dark:text-red-400">Withdraw</button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'New announcement' : 'Edit announcement'} wide>
        <form onSubmit={save} className="space-y-3">
          {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div>
            <label htmlFor="an-title" className="mb-1 flex justify-between text-xs text-gray-500 dark:text-gray-400"><span>Title</span><span>{form.title.length}/80</span></label>
            <input id="an-title" required maxLength={80} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={fieldClass} placeholder="Yoga classes start Monday" />
          </div>
          <div>
            <label htmlFor="an-body" className="mb-1 flex justify-between text-xs text-gray-500 dark:text-gray-400"><span>Message</span><span>{form.body.length}/1000</span></label>
            <textarea id="an-body" required rows={4} maxLength={1000} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} className={fieldClass} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="an-kind" className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Type</label>
              <select id="an-kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className={fieldClass}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </div>
            <div>
              <label htmlFor="an-link" className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Link (optional, https)</label>
              <input id="an-link" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} className={fieldClass} placeholder="https://..." />
            </div>
          </div>

          {editing === 'new' && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="an-aud" className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Send to</label>
                  <select id="an-aud" value={form.audienceType} onChange={(e) => setForm({ ...form, audienceType: e.target.value })} className={fieldClass}>{AUDIENCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                </div>
                {form.audienceType === 'expiring' && (
                  <div>
                    <label htmlFor="an-days" className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Ending within (days)</label>
                    <input id="an-days" type="number" min="1" max="60" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} className={fieldClass} />
                  </div>
                )}
                {form.audienceType === 'plan' && (
                  <div>
                    <label htmlFor="an-plan" className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Plan</label>
                    <select id="an-plan" required value={form.planId} onChange={(e) => setForm({ ...form, planId: e.target.value })} className={fieldClass}><option value="">Choose a plan</option>{plans.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}</select>
                  </div>
                )}
              </div>
              {admin && <BranchPicker branches={branches} value={form.branchIds} onChange={(branchIds) => setForm({ ...form, branchIds })} idPrefix="an" label="Branches" allHint="" />}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="an-start" className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Show from (empty = now)</label>
                  <input id="an-start" type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} className={fieldClass} />
                </div>
                <div>
                  <label htmlFor="an-end" className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Hide after (optional)</label>
                  <input id="an-end" type="datetime-local" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} className={fieldClass} />
                </div>
              </div>
              <p className="rounded-xl bg-accent/10 px-3 py-2 text-sm text-gray-800 dark:text-gray-200">{reach === null ? 'Choose who it is for to see how many members it reaches.' : <>This will reach <strong>{reach}</strong> member{reach === 1 ? '' : 's'}.</>}</p>
            </>
          )}
          {editing !== 'new' && (
            <div>
              <label htmlFor="an-end2" className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Hide after (optional)</label>
              <input id="an-end2" type="datetime-local" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} className={fieldClass} />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Who it is for cannot be changed after publishing. Withdraw it and publish a new one instead.</p>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving} className={primaryBtn}>{saving ? 'Publishing...' : editing === 'new' ? 'Publish' : 'Save changes'}</button>
            <button type="button" onClick={() => setEditing(null)} className={toolBtn}>Cancel</button>
          </div>
        </form>
      </Modal>

      <Modal open={remindersOpen && !!reminders} onClose={() => setRemindersOpen(false)} title="Renewal reminders" wide>
        {reminders && (
          <form onSubmit={saveReminders} className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-300">When on, members see a reminder in their app as their membership end date gets close, and after it has ended. It disappears the moment they renew. Nothing is sent to their phone; they see it when they open the app.</p>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100"><input type="checkbox" checked={reminders.enabled} onChange={(e) => setReminders({ ...reminders, enabled: e.target.checked })} /> Send renewal reminders</label>
            <fieldset disabled={!reminders.enabled} className="space-y-3 disabled:opacity-50">
              <div>
                <legend className="mb-1 text-xs text-gray-500 dark:text-gray-400">Start reminding this many days before the end</legend>
                <div className="flex flex-wrap gap-2">{DAY_CHOICES.map((d) => <label key={d} className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${reminders.daysBefore.includes(d) ? 'border-accent bg-accent/15 font-semibold text-gray-900 dark:text-white' : 'border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300'}`}><input type="checkbox" className="sr-only" checked={reminders.daysBefore.includes(d)} onChange={() => toggleDay(d)} />{d}</label>)}</div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">The reminder begins at the largest number you pick.</p>
              </div>
              <div>
                <label htmlFor="rm-exp" className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Message while it is ending soon</label>
                <textarea id="rm-exp" rows={2} maxLength={300} value={reminders.expiringText} placeholder={reminders.defaults.expiringText} onChange={(e) => setReminders({ ...reminders, expiringText: e.target.value })} className={fieldClass} />
              </div>
              <div>
                <label htmlFor="rm-ended" className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Message after it has ended</label>
                <textarea id="rm-ended" rows={2} maxLength={300} value={reminders.expiredText} placeholder={reminders.defaults.expiredText} onChange={(e) => setReminders({ ...reminders, expiredText: e.target.value })} className={fieldClass} />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">You can use <code>{'{name}'}</code>, <code>{'{date}'}</code> and <code>{'{days}'}</code>. Leave a box empty to use the suggested wording.</p>
            </fieldset>
            {remMsg && <p role="status" className="text-sm text-gray-700 dark:text-gray-200">{remMsg}</p>}
            <div className="flex gap-2"><button type="submit" className={primaryBtn}>Save</button><button type="button" onClick={() => setRemindersOpen(false)} className={toolBtn}>Close</button></div>
          </form>
        )}
      </Modal>
    </div>
  );
}
