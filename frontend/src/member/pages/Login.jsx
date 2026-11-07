import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useMemberAuth } from '../MemberAuth';
import { useBrand } from '../../context/BrandContext';
import BrandMark from '../../components/BrandMark';
import ThemeToggle from '../../components/ThemeToggle';
import { errorText } from '../api';
import { Btn, ErrorText, Field, Muted } from '../ui';

export default function MemberLogin() {
  const { ready, member, signIn } = useMemberAuth();
  const { brand, unknownGym } = useBrand();
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (ready && member) return <Navigate to="/member" replace />;

  if (unknownGym) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <div className="bg-white dark:bg-gray-800 dark:border dark:border-gray-700 p-8 rounded-2xl shadow w-full max-w-sm text-center space-y-2">
          <h1 className="text-xl font-extrabold text-gray-900 dark:text-gray-100">We couldn't find this gym</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300">Check the address your gym gave you.</p>
        </div>
      </div>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    if (!identifier.trim() || !password) { setError('Enter your member code or email, and your password.'); return; }
    setBusy(true);
    setError('');
    try {
      await signIn(identifier, password);
      navigate(location.state?.from?.startsWith('/member') ? location.state.from : '/member', { replace: true });
    } catch (err) {
      setError(errorText(err, 'Could not sign in.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4 relative">
      <div className="absolute top-4 right-4"><ThemeToggle className="text-gray-500 dark:text-gray-400" /></div>
      <form onSubmit={submit} className="w-full max-w-sm space-y-5">
        <div className="space-y-3">
          <BrandMark brand={brand} size={64} />
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 dark:text-gray-100">{brand?.name || 'FlexHub'}</h1>
            <p className="text-gray-500 dark:text-gray-400">{brand?.tagline || 'Your gym, in your pocket.'}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 dark:border dark:border-gray-700 rounded-3xl shadow-sm p-5 space-y-4">
          <Field label="Member code or email" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoCapitalize="none" autoCorrect="off" autoComplete="username" />
          <Field label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          <ErrorText>{error}</ErrorText>
          <Btn type="submit" busy={busy} className="w-full">Sign in</Btn>
        </div>
        <Muted>No login yet, or forgot your password? Ask the front desk at your gym.</Muted>
        <p className="text-sm text-gray-500 dark:text-gray-400">Gym staff? <Link to="/login" className="text-blue-600 dark:text-blue-400 hover:underline">Sign in here</Link></p>
      </form>
    </div>
  );
}
