import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Send, User } from 'lucide-react';
import { memberApi, errorText } from '../api';
import AuthShell, { AuthButton, AuthField, authLink } from '../../components/auth/AuthShell';

// Members: by member ID or email. A member with no email on file cannot be emailed, and is told to ask the front desk.
export default function MemberForgotPassword() {
  const [identifier, setIdentifier] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState('');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!identifier.trim()) { setError('Enter your member code or email.'); return; }
    setBusy(true);
    setError('');
    try {
      const { data } = await memberApi.post('/member-auth/forgot-password', { identifier: identifier.trim() });
      setSent(data.message);
    } catch (err) {
      setError(errorText(err, 'Could not send the link. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <div className="space-y-5">
        <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 dark:text-gray-100">Forgot your password?</h1>
        {sent ? (
          <>
            <p role="status" className="text-sm text-gray-700 dark:text-gray-200">{sent}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">The link works once and for an hour.</p>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            <p className="text-sm text-gray-600 dark:text-gray-300">Enter your member code or email. If we have an email address for you, we will send a link to choose a new password.</p>
            <AuthField id="mf-id" label="Member code or email" icon={User} value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoCapitalize="none" autoCorrect="off" autoComplete="username" placeholder="Member code or email" />
            {error && <div role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</div>}
            <AuthButton type="submit" icon={Send} disabled={busy}>{busy ? 'Sending…' : 'Email me a link'}</AuthButton>
          </form>
        )}
        <p className="text-xs text-gray-500 dark:text-gray-400">No email on file? Ask the front desk at your gym to reset your app login.</p>
        <Link to="/member/login" className={`${authLink} inline-flex items-center gap-1 text-sm`}><ArrowLeft className="h-4 w-4" /> Back to sign in</Link>
      </div>
    </AuthShell>
  );
}
