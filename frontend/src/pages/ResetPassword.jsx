import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Lock, LogIn, Save } from 'lucide-react';
import { authAPI } from '../services/api';
import AuthShell, { AuthButton, AuthField, authLink } from '../components/auth/AuthShell';

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

  return (
    <AuthShell>
      {done ? (
        <div className="space-y-5">
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 dark:text-gray-100">Password changed</h1>
          <p role="status" className="text-sm text-gray-700 dark:text-gray-200">{done}</p>
          <Link to="/login" className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent px-4 py-3.5 text-lg font-bold text-accent-ink hover:brightness-110"><LogIn className="h-5 w-5" /> Log in</Link>
        </div>
      ) : dead ? (
        <div className="space-y-4">
          <h1 className="text-xl font-extrabold text-gray-900 dark:text-gray-100">This link does not work</h1>
          <p role="alert" className="text-sm text-gray-700 dark:text-gray-200">It may have been used already, or it expired (links last an hour). Ask for a new one.</p>
          <Link to="/forgot-password" className={`${authLink} inline-block text-sm`}>Send me a new link</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 dark:text-gray-100">Choose a new password</h1>
          {error && <div role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</div>}
          <div>
            <AuthField id="rp-pw" label="New password" icon={Lock} password value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} maxLength={72} autoComplete="new-password" />
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">At least 8 characters. Avoid common passwords and your own name or email.</p>
          </div>
          <AuthField id="rp-again" label="Type it again" icon={Lock} password value={again} onChange={(e) => setAgain(e.target.value)} required autoComplete="new-password" />
          <AuthButton type="submit" icon={Save} disabled={busy}>{busy ? 'Saving…' : 'Change password'}</AuthButton>
        </form>
      )}
    </AuthShell>
  );
}
