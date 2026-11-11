import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authAPI } from '../services/api';
import ThemeToggle from '../components/ThemeToggle';

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
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4 relative">
      <div className="absolute top-4 right-4"><ThemeToggle className="text-gray-500 dark:text-gray-400" /></div>
      <div className="bg-white dark:bg-gray-800 dark:border dark:border-gray-700 p-8 rounded-2xl shadow w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 dark:text-gray-100">Forgot your password?</h1>
        {sent ? (
          <>
            <p role="status" className="text-sm text-gray-700 dark:text-gray-200">{sent}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">The link works once and for an hour.</p>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">Enter the email you sign in with. We will email you a link to choose a new password.</p>
            {error && <div role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</div>}
            <div>
              <label htmlFor="fp-email" className="block text-sm text-gray-600 dark:text-gray-300 mb-1">Email</label>
              <input id="fp-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email"
                className="w-full border rounded-xl px-3 py-2.5 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100" />
            </div>
            <button type="submit" disabled={busy || !email} className="w-full bg-gray-900 text-white rounded-xl py-2.5 hover:bg-gray-800 dark:bg-accent dark:text-accent-ink dark:font-semibold dark:hover:bg-accent-hover disabled:opacity-50">
              {busy ? 'Sending…' : 'Email me a link'}
            </button>
          </form>
        )}
        <Link to="/login" className="inline-block text-sm underline text-gray-700 dark:text-accent">Back to log in</Link>
      </div>
    </div>
  );
}
