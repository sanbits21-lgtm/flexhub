import { useState } from 'react';
import { Link } from 'react-router-dom';
import { memberApi, errorText } from '../api';
import { useBrand } from '../../context/BrandContext';
import BrandMark from '../../components/BrandMark';
import ThemeToggle from '../../components/ThemeToggle';
import { Btn, ErrorText, Field, Muted } from '../ui';

// Members: by member ID or email. A member with no email on file cannot be emailed, and is told to ask the front desk.
export default function MemberForgotPassword() {
  const { brand } = useBrand();
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4 relative">
      <div className="absolute top-4 right-4"><ThemeToggle className="text-gray-500 dark:text-gray-400" /></div>
      <div className="w-full max-w-sm space-y-5">
        <div className="space-y-3">
          <BrandMark brand={brand} size={56} />
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-gray-100">Forgot your password?</h1>
        </div>
        <div className="bg-white dark:bg-gray-800 dark:border dark:border-gray-700 rounded-3xl shadow-sm p-5 space-y-4">
          {sent ? (
            <>
              <p role="status" className="text-sm text-gray-700 dark:text-gray-200">{sent}</p>
              <Muted>The link works once and for an hour.</Muted>
            </>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <Muted>Enter your member code or email. If we have an email address for you, we will send a link to choose a new password.</Muted>
              <Field label="Member code or email" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoCapitalize="none" autoCorrect="off" autoComplete="username" />
              <ErrorText>{error}</ErrorText>
              <Btn type="submit" busy={busy} className="w-full">Email me a link</Btn>
            </form>
          )}
        </div>
        <Muted>No email on file? Ask the front desk at your gym to reset your app login.</Muted>
        <Link to="/member/login" className="inline-block text-sm text-blue-600 dark:text-blue-400 hover:underline">Back to sign in</Link>
      </div>
    </div>
  );
}
