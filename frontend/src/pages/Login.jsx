import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from '../components/ThemeToggle';
import BrandMark from '../components/BrandMark';
import { useBrand } from '../context/BrandContext';

export default function Login() {
  const { login } = useAuth();
  const { brand, unknownGym } = useBrand();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [trial, setTrial] = useState(null); // set when this address accepts new gyms
  useEffect(() => { authAPI.signupConfig().then((r) => { if (r.data.enabled) setTrial(r.data); }).catch(() => {}); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    }
  };

  if (unknownGym) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
        <div className="bg-white dark:bg-gray-800 dark:border dark:border-gray-700 p-8 rounded-2xl shadow w-full max-w-sm text-center space-y-2">
          <h1 className="text-xl font-extrabold text-gray-900 dark:text-gray-100">We couldn't find this gym</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300">Check the address you were given, or ask your gym for the right link.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle className="hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white" />
      </div>
      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 dark:border dark:border-gray-700 p-8 rounded-2xl shadow w-full max-w-sm space-y-4">
        <div className="flex items-center gap-3">
          <BrandMark brand={brand} size={44} />
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 dark:text-gray-100 truncate">{brand?.name || 'FlexHub'}</h1>
            {brand?.tagline && <p className="text-sm text-gray-600 dark:text-gray-300">{brand.tagline}</p>}
          </div>
        </div>
        {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}
        <div>
          <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
            className="w-full border rounded-xl px-3 py-2.5 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100" />
        </div>
        <div>
          <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
            className="w-full border rounded-xl px-3 py-2.5 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100" />
        </div>
        <button type="submit" className="w-full bg-gray-900 text-white rounded-xl py-2.5 hover:bg-gray-800 dark:bg-accent dark:text-accent-ink dark:font-semibold dark:hover:bg-accent-hover">
          Log in
        </button>
        <p className="text-sm text-center text-gray-600 dark:text-gray-300">
          Gym member? <Link to="/member/login" className="font-semibold underline dark:text-accent">Open the member app</Link>
        </p>
        {trial && (
          <p className="text-sm text-center text-gray-600 dark:text-gray-300">
            New gym? <Link to="/signup" className="font-semibold underline dark:text-accent">Start your {trial.trialDays}-day free trial</Link>
          </p>
        )}
      </form>
    </div>
  );
}
