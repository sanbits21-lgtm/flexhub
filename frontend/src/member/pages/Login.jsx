import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { LogIn, Lock, User } from 'lucide-react';
import { useMemberAuth } from '../MemberAuth';
import { useBrand } from '../../context/BrandContext';
import AuthShell, { AuthButton, AuthField, authLink } from '../../components/auth/AuthShell';
import { errorText } from '../api';

export default function MemberLogin() {
  const { ready, member, signIn } = useMemberAuth();
  const { unknownGym } = useBrand();
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Where to go once signed in: the page they were sent here from, else the home screen. Used by
  // both exits below, so the "already signed in" redirect cannot override the one after sign-in.
  const from = location.state?.from;
  const destination = typeof from === 'string' && from.startsWith('/member') && !from.startsWith('/member/login') ? from : '/member';

  if (ready && member) return <Navigate to={destination} replace />;

  if (unknownGym) {
    return (
      <AuthShell>
        <div className="space-y-2 text-center">
          <h1 className="text-xl font-extrabold text-gray-900 dark:text-gray-100">We couldn't find this gym</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300">Check the address your gym gave you.</p>
        </div>
      </AuthShell>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    if (!identifier.trim() || !password) { setError('Enter your member code or email, and your password.'); return; }
    setBusy(true);
    setError('');
    try {
      await signIn(identifier, password);
      navigate(destination, { replace: true });
    } catch (err) {
      setError(errorText(err, 'Could not sign in.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <form onSubmit={submit} className="space-y-5">
        <AuthField id="m-id" label="Member code or email" icon={User} value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoCapitalize="none" autoCorrect="off" autoComplete="username" placeholder="Member code or email" />
        <AuthField id="m-pw" label="Password" icon={Lock} password value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="Your password" />
        {error && <div role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</div>}
        <AuthButton type="submit" icon={LogIn} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</AuthButton>
        <p className="text-center text-sm"><Link to="/member/forgot-password" className={authLink}>Forgot your password?</Link></p>
        <p className="text-center text-xs text-gray-500 dark:text-gray-400">No login yet, or no email on file? Ask the front desk at your gym.</p>
        <p className="text-center text-sm text-gray-500 dark:text-gray-400">Gym staff? <Link to="/login" className={authLink}>Sign in here</Link></p>
      </form>
    </AuthShell>
  );
}
