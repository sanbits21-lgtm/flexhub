import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ChevronRight, Gift, LogIn, Mail, Lock, Users } from 'lucide-react';
import { authAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useBrand } from '../context/BrandContext';
import AuthShell, { AuthButton, AuthField, RuleText, authLink } from '../components/auth/AuthShell';

export default function Login() {
  const { user, loading, login } = useAuth();
  const { unknownGym } = useBrand();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [trial, setTrial] = useState(null); // set when this address accepts new gyms
  useEffect(() => { authAPI.signupConfig().then((r) => { if (r.data.enabled) setTrial(r.data); }).catch(() => {}); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  // Already signed in (the session cookie is still good): nothing to type, go to the dashboard. Wait for the check first, so the
  // form never flashes up for someone who is signed in.
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  if (unknownGym) {
    return (
      <AuthShell>
        <div className="space-y-2 text-center">
          <h1 className="text-xl font-extrabold text-gray-900 dark:text-gray-100">We couldn't find this gym</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300">Check the address you were given, or ask your gym for the right link.</p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <div role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">{error}</div>}
        <AuthField id="login-email" label="Email" icon={Mail} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" placeholder="you@example.com" />
        <AuthField id="login-password" label="Password" icon={Lock} password value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" placeholder="Your password" />
        <AuthButton type="submit" icon={LogIn} disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</AuthButton>
        <RuleText><Link to="/forgot-password" className={authLink}>Forgot your password?</Link></RuleText>
        <p className="text-center text-xs text-gray-500 dark:text-gray-400">No access to your email? Your gym owner or branch manager can give you a temporary password. Owners can ask FitzyClub support.</p>
        <div className="space-y-3 text-center text-sm text-gray-600 dark:text-gray-300">
          <p className="flex items-center justify-center gap-2">
            <Users className="h-4 w-4 text-gray-400" aria-hidden="true" />
            Gym member? <Link to="/member/login" className={`${authLink} inline-flex items-center`}>Open the member app <ChevronRight className="h-4 w-4" /></Link>
          </p>
          {trial && (
            <p className="flex items-center justify-center gap-2">
              <Gift className="h-4 w-4 text-gray-400" aria-hidden="true" />
              New gym? <Link to="/signup" className={`${authLink} inline-flex items-center`}>Start your {trial.trialDays}-day free trial <ChevronRight className="h-4 w-4" /></Link>
            </p>
          )}
        </div>
      </form>
    </AuthShell>
  );
}
