import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import Modal from './Modal';
import { fieldClass, primaryBtn, toolBtn } from './ListToolbar';
import { authAPI } from '../services/api';
import { setToken } from '../services/authToken';
import { passwordFormProblem } from '../utils/passwordForm';

const errorMessage = (err) => err?.response?.data?.message || err?.message || 'Could not change the password. Please try again.';
const blank = { current: '', next: '', confirm: '' };

/** Change your own password from the website. Everyone signed in as staff can use it. */
export default function ChangePasswordModal({ open, onClose }) {
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => { if (open) { setForm(blank); setError(''); setDone(false); } }, [open]);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const problem = passwordFormProblem(form);
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError('');
    try {
      const res = await authAPI.changePassword(form.current, form.next);
      // The server ends every other login and hands this one a fresh token, so keep it or this tab would be signed out too.
      if (res.data?.token) setToken(res.data.token);
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Change password">
      {done ? (
        <div className="space-y-3 text-sm text-gray-700 dark:text-gray-200">
          <p className="flex items-center gap-2 font-semibold text-green-700 dark:text-accent"><Check className="h-5 w-5" aria-hidden="true" /> Your password was changed.</p>
          <p>You stay signed in here. Everywhere else you were signed in (other browsers, the phone app) has been signed out, so sign in again there with the new password.</p>
          <button type="button" onClick={onClose} className={primaryBtn}>Done</button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div>
            <label htmlFor="cp-current" className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Current password</label>
            <input id="cp-current" type="password" autoComplete="current-password" required value={form.current} onChange={set('current')} className={fieldClass} />
          </div>
          <div>
            <label htmlFor="cp-new" className="mb-1 block text-xs text-gray-500 dark:text-gray-400">New password</label>
            <input id="cp-new" type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={form.next} onChange={set('next')} className={fieldClass} />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">At least 8 characters. Avoid common passwords and your own name, email or phone number.</p>
          </div>
          <div>
            <label htmlFor="cp-confirm" className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Type the new password again</label>
            <input id="cp-confirm" type="password" autoComplete="new-password" required value={form.confirm} onChange={set('confirm')} className={fieldClass} />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={busy} className={primaryBtn}>{busy ? 'Changing...' : 'Change password'}</button>
            <button type="button" onClick={onClose} className={toolBtn}>Cancel</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
