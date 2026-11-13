import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, Send } from 'lucide-react';
import { authAPI } from '../services/api';
import AuthShell, { AuthButton, AuthField, authLink } from '../components/auth/AuthShell';

// Staff, owners and platform admins. The answer is the same whether or not the address has an
// account, so this page cannot be used to find out who does.
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState('');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await authAPI.forgotPassword(email.trim());
      setSent(data.message);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not send the link. Please try again.');
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
            <p className="text-sm text-gray-600 dark:text-gray-300">Enter the email you sign in with. We will email you a link to choose a new password.</p>
            {error && <div role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</div>}
            <AuthField id="fp-email" label="Email" icon={Mail} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="you@example.com" />
            <AuthButton type="submit" icon={Send} disabled={busy || !email}>{busy ? 'Sending…' : 'Email me a link'}</AuthButton>
          </form>
        )}
        <Link to="/login" className={`${authLink} inline-flex items-center gap-1 text-sm`}><ArrowLeft className="h-4 w-4" /> Back to log in</Link>
      </div>
    </AuthShell>
  );
}
