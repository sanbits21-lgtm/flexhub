import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authAPI } from '../services/api';
import ThemeToggle from '../components/ThemeToggle';

// The page the emailed link opens, for staff, owners and platform admins.
export default function ResetPassword() {
  const [params] = useSearchParams();
  // Read the token once, then take it out of the address bar so it is not left in the browser history.
  const [token] = useState(() => params.get('token') || '');
  useEffect(() => { if (token) window.history.replaceState(null, '', window.location.pathname); }, [token]);

  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const [error, setError] = useState('');
  const [dead, setDead] = useState(!token); // the link is used up, expired or missing

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== again) { setError('The two passwords do not match.'); return; }
    setBusy(true);
    try {
      const { data } = await authAPI.resetPassword(token, password);
      setDone(data.message);
    } catch (err) {
      if (err.response?.data?.code === 'LINK_INVALID') setDead(true);
      else setError(err.response?.data?.message || 'Could not change your password. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const input = 'w-full border rounded-xl px-3 py-2.5 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100';
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4 relative">
      <div className="absolute top-4 right-4"><ThemeToggle className="text-gray-500 dark:text-gray-400" /></div>
      <div className="bg-white dark:bg-gray-800 dark:border dark:border-gray-700 p-8 rounded-2xl shadow w-full max-w-sm space-y-4">
        {done ? (
          <>
            <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 dark:text-gray-100">Password changed</h1>
            <p role="status" className="text-sm text-gray-700 dark:text-gray-200">{done}</p>
            <Link to="/login" className="block w-full text-center bg-gray-900 text-white rounded-xl py-2.5 dark:bg-accent dark:text-accent-ink dark:font-semibold">Log in</Link>
          </>
        ) : dead ? (
          <>
            <h1 className="text-xl font-extrabold text-gray-900 dark:text-gray-100">This link does not work</h1>
            <p role="alert" className="text-sm text-gray-700 dark:text-gray-200">It may have been used already, or it expired (links last an hour). Ask for a new one.</p>
            <Link to="/forgot-password" className="inline-block text-sm underline text-gray-700 dark:text-accent">Send me a new link</Link>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 dark:text-gray-100">Choose a new password</h1>
            {error && <div role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</div>}
            <div>
              <label htmlFor="rp-pw" className="block text-sm text-gray-600 dark:text-gray-300 mb-1">New password</label>
              <input id="rp-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} maxLength={72} autoComplete="new-password" className={input} />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">At least 8 characters. Avoid common passwords and your own name or email.</p>
            </div>
            <div>
              <label htmlFor="rp-again" className="block text-sm text-gray-600 dark:text-gray-300 mb-1">Type it again</label>
              <input id="rp-again" type="password" value={again} onChange={(e) => setAgain(e.target.value)} required autoComplete="new-password" className={input} />
            </div>
            <button type="submit" disabled={busy} className="w-full bg-gray-900 text-white rounded-xl py-2.5 hover:bg-gray-800 dark:bg-accent dark:text-accent-ink dark:font-semibold dark:hover:bg-accent-hover disabled:opacity-50">
              {busy ? 'Saving…' : 'Change password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
