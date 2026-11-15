import { useEffect, useState } from 'react';
import { Check, Copy, KeyRound } from 'lucide-react';
import Modal from './Modal';
import { toolBtn, primaryBtn } from './ListToolbar';

const errorMessage = (err) => err?.response?.data?.message || err?.message || 'Something went wrong. Please try again.';

/**
 * Helps someone who cannot sign in and cannot use an email link: pick the person, create a temporary password, and read it out
 * once. `load()` returns the people ({ _id, name, email, hint }); `reset(id)` returns { name, email, password, emailConfirmed? }.
 */
export default function TempPasswordDialog({ open, onClose, title, intro, load, reset }) {
  const [people, setPeople] = useState(null);
  const [picked, setPicked] = useState(null); // the person about to be reset
  const [creds, setCreds] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPeople(null); setPicked(null); setCreds(null); setError('');
    load().then(setPeople).catch((err) => { setPeople([]); setError(errorMessage(err)); });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async () => {
    setBusy(true);
    setError('');
    try { setCreds((await reset(picked._id)).data); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(creds.password); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ } };

  return (
    <Modal open={open} onClose={onClose} title={creds ? `Temporary password: ${creds.name}` : picked ? `Reset password: ${picked.name}` : title}>
      <div className="space-y-3 text-sm text-gray-700 dark:text-gray-200">
        {error && <p role="alert" className="text-red-600 dark:text-red-400">{error}</p>}

        {creds ? (
          <>
            <p>Give these to {creds.name}. The password is shown <strong>once</strong>, and they should change it after signing in. We also emailed them that it was reset.</p>
            {creds.emailConfirmed === false && <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-amber-800 dark:text-amber-300">This person never confirmed their email address, so they cannot sign in until they do.</p>}
            <dl className="grid grid-cols-[6rem_1fr] gap-y-1">
              <dt className="text-gray-500 dark:text-gray-400">Email</dt><dd className="break-all font-mono">{creds.email}</dd>
              <dt className="text-gray-500 dark:text-gray-400">Password</dt>
              <dd className="flex items-center gap-2 font-mono">{creds.password}<button type="button" onClick={copy} aria-label="Copy password" className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-100">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button></dd>
            </dl>
            <button type="button" onClick={onClose} className={toolBtn}>Done</button>
          </>
        ) : picked ? (
          <>
            <p>This creates a temporary password for {picked.name}. Their current password stops working, they are signed out everywhere, and any sign-in lock is lifted.</p>
            <div className="flex gap-2"><button type="button" onClick={run} disabled={busy} className={primaryBtn}>{busy ? 'Creating...' : 'Create temporary password'}</button><button type="button" onClick={() => setPicked(null)} className={toolBtn}>Back</button></div>
          </>
        ) : (
          <>
            {intro && <p>{intro}</p>}
            {people === null ? <p className="text-gray-500 dark:text-gray-400">Loading...</p> : people.length === 0 ? <p className="text-gray-500 dark:text-gray-400">No one found.</p> : (
              <ul className="divide-y divide-gray-100 dark:divide-white/5">
                {people.map((p) => (
                  <li key={p._id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0"><p className="truncate font-medium text-gray-900 dark:text-gray-100">{p.name}{p.isActive === false ? ' (inactive)' : ''}</p><p className="truncate text-xs text-gray-500 dark:text-gray-400">{[p.email, p.hint].filter(Boolean).join(' · ')}</p></div>
                    <button type="button" onClick={() => { setError(''); setPicked(p); }} disabled={p.isActive === false} className="inline-flex shrink-0 items-center gap-1 text-blue-600 hover:underline disabled:text-gray-300 disabled:no-underline dark:text-blue-400"><KeyRound className="h-4 w-4" /> Reset password</button>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" onClick={onClose} className={toolBtn}>Close</button>
          </>
        )}
      </div>
    </Modal>
  );
}
