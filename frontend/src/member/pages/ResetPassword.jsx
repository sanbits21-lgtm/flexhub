import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Lock, Save } from 'lucide-react';
import { memberApi, errorText } from '../api';
import AuthShell, { AuthButton, AuthField, authLink } from '../../components/auth/AuthShell';

// The page a member's emailed link opens.
export default function MemberResetPassword() {
  const [params] = useSearchParams();
  // Read the token once, then take it out of the address bar so it is not left in the browser history.
  const [token] = useState(() => params.get('token') || '');
  useEffect(() => { if (token) window.history.replaceState(null, '', window.location.pathname); }, [token]);

  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const [error, setError] = useState('');
  const [dead, setDead] = useState(!token);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Use at least 8 characters.'); return; }
    if (password !== again) { setError('The two passwords do not match.'); return; }
    setBusy(true);
    try {
      const { data } = await memberApi.post('/member-auth/reset-password', { token, password });
      setDone(data.message);
    } catch (err) {
      if (err.response?.data?.code === 'LINK_INVALID') setDead(true);
      else setError(errorText(err, 'Could not change your password. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <div className="space-y-5">
        <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 dark:text-gray-100">{done ? 'Password changed' : dead ? 'This link does not work' : 'Choose a new password'}</h1>
        {done ? (
          <>
            <p role="status" className="text-sm text-gray-700 dark:text-gray-200">{done}</p>
            <Link to="/member/login" className="block w-full rounded-2xl bg-accent px-4 py-3.5 text-center text-lg font-bold text-accent-ink">Sign in</Link>
          </>
        ) : dead ? (
          <>
            <p role="alert" className="text-sm text-gray-700 dark:text-gray-200">It may have been used already, or it expired (links last an hour). Ask for a new one.</p>
            <Link to="/member/forgot-password" className={`${authLink} text-sm`}>Send me a new link</Link>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            <AuthField id="mr-pw" label="New password" icon={Lock} password value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="At least 8 characters" />
            <AuthField id="mr-pw2" label="Type it again" icon={Lock} password value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" placeholder="Repeat the password" />
            <p className="text-xs text-gray-500 dark:text-gray-400">Avoid common passwords and your own name.</p>
            {error && <div role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</div>}
            <AuthButton type="submit" icon={Save} disabled={busy}>{busy ? 'Saving…' : 'Change password'}</AuthButton>
            <p className="text-center text-xs text-gray-500 dark:text-gray-400">Still stuck? Ask the front desk at your gym.</p>
          </form>
        )}
      </div>
    </AuthShell>
  );
}
