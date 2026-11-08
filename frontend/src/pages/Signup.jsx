import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { authAPI } from '../services/api';
import ThemeToggle from '../components/ThemeToggle';
import { limitsLabel, priceLabel, trialLabel } from '../utils/packages';

const inputClass = 'w-full border rounded-xl px-3 py-2.5 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100';
const labelClass = 'block text-sm text-gray-600 dark:text-gray-300 mb-1';

export default function Signup() {
  const [config, setConfig] = useState(null);
  const [form, setForm] = useState({ gymName: '', ownerName: '', email: '', phone: '', password: '', website: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState(null);
  const [resent, setResent] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const [packageId, setPackageId] = useState('');

  useEffect(() => {
    authAPI.signupConfig().then((r) => {
      setConfig(r.data);
      const offered = r.data.packages || [];
      setPackageId((offered.find((p) => p.isFeatured) || offered[0])?._id || '');
    }).catch(() => setConfig({ enabled: false }));
  }, []);

  const packages = config?.packages || [];
  const chosen = packages.find((p) => p._id === packageId);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await authAPI.signup(packages.length ? { ...form, packageId } : form);
      setSentTo(res.data.email);
    } catch (err) {
      const d = err.response?.data;
      setError(d?.errors?.length ? d.errors.map((x) => `${x.field} ${x.message}`).join('. ') : d?.message || 'Could not create your account. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const shell = (children) => (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 relative p-4">
      <div className="absolute top-4 right-4"><ThemeToggle className="hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white" /></div>
      {children}
    </div>
  );

  const resend = async () => {
    setResent(false);
    await authAPI.resendVerification(sentTo).catch(() => {});
    setResent(true);
  };

  if (sentTo) {
    return shell(
      <div className="bg-white dark:bg-gray-800 dark:border dark:border-gray-700 p-8 rounded-2xl shadow w-full max-w-md space-y-4">
        <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 dark:text-gray-100">Check your email</h1>
        <p className="text-gray-700 dark:text-gray-200">We sent an email to <strong>{sentTo}</strong>. Open it to confirm your address. (If that address already has an account, the email says so and links to the sign-in page.)</p>
        <p className="text-sm text-gray-600 dark:text-gray-300">After that, our team reviews every new gym. We'll email you as soon as yours is approved, and {chosen ? (chosen.trialDays > 0 ? `your ${chosen.trialDays}-day free trial` : `your ${chosen.name} package`) : `your ${config?.trialDays}-day free trial`} starts then, not before.</p>
        <button type="button" onClick={resend} className="text-sm underline text-gray-700 dark:text-accent">Didn't get it? Send it again</button>
        {resent && <p role="status" className="text-sm text-green-700 dark:text-green-400">If that address is waiting for confirmation, a new link is on its way.</p>}
        <div><Link to="/login" className="text-sm underline text-gray-700 dark:text-gray-300">Back to log in</Link></div>
      </div>,
    );
  }

  if (!config) return shell(<div className="text-gray-500 dark:text-gray-400">Loading...</div>);
  if (!config.enabled) {
    return shell(
      <div className="bg-white dark:bg-gray-800 dark:border dark:border-gray-700 p-8 rounded-2xl shadow w-full max-w-sm space-y-3 text-center">
        <h1 className="text-xl font-extrabold text-gray-900 dark:text-gray-100">Sign-up isn't available here</h1>
        <Link to="/login" className="underline text-gray-700 dark:text-accent">Back to log in</Link>
      </div>,
    );
  }

  return shell(
    <form onSubmit={submit} className={`bg-white dark:bg-gray-800 dark:border dark:border-gray-700 p-8 rounded-2xl shadow w-full space-y-4 ${packages.length ? 'max-w-3xl' : 'max-w-md'}`}>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 dark:text-gray-100">{packages.length ? 'Register your gym' : 'Start your free trial'}</h1>
        {packages.length === 0 && <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{config.trialDays} days free, up to {config.maxMembers} members. No card needed. </p>}
        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">New gyms are approved by our team after you confirm your email, and nothing is charged by registering.</p>
      </div>
      {packages.length > 0 && (
        <fieldset>
          <legend className={labelClass}>Choose a package</legend>
          <div role="radiogroup" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {packages.map((p) => {
              const on = p._id === packageId;
              return (
                <label key={p._id} className={`relative cursor-pointer rounded-2xl border p-4 space-y-1 ${on ? 'border-accent ring-2 ring-accent bg-accent/5' : 'border-gray-300 dark:border-gray-600'}`}>
                  <input type="radio" name="package" value={p._id} checked={on} onChange={() => setPackageId(p._id)} className="sr-only" />
                  {p.isFeatured && <span className="absolute -top-2 right-3 text-xs font-semibold rounded-full px-2 py-0.5 bg-accent text-accent-ink">Most popular</span>}
                  <div className="font-bold text-gray-900 dark:text-gray-100">{p.name}</div>
                  <div className="text-xl font-extrabold text-gray-900 dark:text-gray-100">{priceLabel(p)}</div>
                  {p.description && <div className="text-sm text-gray-600 dark:text-gray-300">{p.description}</div>}
                  <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{trialLabel(p)}</div>
                  <ul className="text-sm text-gray-600 dark:text-gray-300 list-disc pl-5">
                    <li>{limitsLabel(p)}</li>
                    {p.highlights.map((h) => <li key={h}>{h}</li>)}
                  </ul>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}
      {error && <div role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</div>}
      <div><label htmlFor="s-gym" className={labelClass}>Gym name</label><input id="s-gym" required minLength={2} maxLength={60} value={form.gymName} onChange={set('gymName')} className={inputClass} /></div>
      <div><label htmlFor="s-owner" className={labelClass}>Your name</label><input id="s-owner" required autoComplete="name" value={form.ownerName} onChange={set('ownerName')} className={inputClass} /></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label htmlFor="s-email" className={labelClass}>Email</label><input id="s-email" type="email" required autoComplete="email" value={form.email} onChange={set('email')} className={inputClass} /></div>
        <div><label htmlFor="s-phone" className={labelClass}>Phone</label><input id="s-phone" type="tel" required autoComplete="tel" value={form.phone} onChange={set('phone')} className={inputClass} /></div>
      </div>
      <div><label htmlFor="s-pw" className={labelClass}>Password <span className="text-gray-500">(8+ characters)</span></label><input id="s-pw" type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={form.password} onChange={set('password')} className={inputClass} /></div>
      {/* Honeypot: invisible to people, tempting to bots. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px' }}>
        <label>Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} /></label>
      </div>
      <button type="submit" disabled={busy} className="w-full bg-gray-900 text-white rounded-xl py-2.5 dark:bg-accent dark:text-accent-ink dark:font-semibold dark:hover:bg-accent-hover disabled:opacity-50">{busy ? 'Registering...' : chosen ? `Register with ${chosen.name}` : 'Register my gym'}</button>
      <p className="text-sm text-center text-gray-600 dark:text-gray-300">Already registered? <Link to="/login" className="font-semibold underline dark:text-accent">Log in</Link></p>
    </form>,
  );
}
