import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { memberApi, errorText } from '../api';
import { useBrand } from '../../context/BrandContext';
import BrandMark from '../../components/BrandMark';
import ThemeToggle from '../../components/ThemeToggle';
import { Btn, ErrorText, Field, Muted } from '../ui';

// The page a member's emailed link opens.
export default function MemberResetPassword() {
  const { brand } = useBrand();
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4 relative">
      <div className="absolute top-4 right-4"><ThemeToggle className="text-gray-500 dark:text-gray-400" /></div>
      <div className="w-full max-w-sm space-y-5">
        <div className="space-y-3">
          <BrandMark brand={brand} size={56} />
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-gray-100">{done ? 'Password changed' : dead ? 'This link does not work' : 'Choose a new password'}</h1>
        </div>
        <div className="bg-white dark:bg-gray-800 dark:border dark:border-gray-700 rounded-3xl shadow-sm p-5 space-y-4">
          {done ? (
            <>
              <p role="status" className="text-sm text-gray-700 dark:text-gray-200">{done}</p>
              <Link to="/member/login" className="block w-full text-center rounded-xl px-4 py-2.5 font-semibold bg-gray-900 text-white dark:bg-accent dark:text-accent-ink">Sign in</Link>
            </>
          ) : dead ? (
            <>
              <p role="alert" className="text-sm text-gray-700 dark:text-gray-200">It may have been used already, or it expired (links last an hour). Ask for a new one.</p>
              <Link to="/member/forgot-password" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">Send me a new link</Link>
            </>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <Field label="New password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" hint="At least 8 characters. Avoid common passwords and your own name." />
              <Field label="Type it again" type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" />
              <ErrorText>{error}</ErrorText>
              <Btn type="submit" busy={busy} className="w-full">Change password</Btn>
            </form>
          )}
        </div>
        {!done && <Muted>Still stuck? Ask the front desk at your gym.</Muted>}
      </div>
    </div>
  );
}
