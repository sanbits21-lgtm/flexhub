import { useEffect, useState } from 'react';
import { platformSettingsAPI } from '../services/api';

const when = (iso) => new Date(iso).toLocaleString();

/**
 * Is email working? Sign-up, confirmations and approvals all depend on it, and a failure used to
 * show only as a vague "couldn't send" on the sign-up page. This says what is configured, whether
 * the mail server accepts the login, what the last real failure was, and can send a test message.
 */
export default function EmailCheck() {
  const [status, setStatus] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);

  const load = () => {
    setLoadError('');
    platformSettingsAPI.emailStatus().then((r) => setStatus(r.data)).catch(() => setLoadError('Could not check email.'));
  };
  useEffect(() => { load(); }, []);

  const test = async () => {
    setTesting(true);
    setResult(null);
    try { setResult((await platformSettingsAPI.testEmail()).data); } catch (e) { setResult({ ok: false, hint: e.response?.data?.message || 'The test could not be run.' }); } finally { setTesting(false); load(); }
  };

  const card = 'bg-white dark:bg-gray-800 dark:border dark:border-gray-700 p-4 rounded-2xl shadow space-y-3';
  const bad = 'text-sm text-red-700 dark:text-red-400';
  const good = 'text-sm text-green-700 dark:text-green-400';

  return (
    <section aria-label="Email" className={card}>
      <div>
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Email</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">Sign-up confirmations, approval notices, renewal receipts and plan reminders are sent by email. Gyms cannot register while it is not working.</p>
      </div>
      {loadError && <div role="alert" className={bad}>{loadError}</div>}
      {!status && !loadError && <p className="text-sm text-gray-500 dark:text-gray-400">Checking...</p>}
      {status && !status.configured && (
        <div role="alert" className={bad}>
          Email is not set up. Set <code>SMTP_URL</code> (or <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code>) and <code>MAIL_FROM</code> in the service's environment, then redeploy. Until then, sign-up stays closed in production.
        </div>
      )}
      {status && status.configured && (
        <div className="space-y-2 text-sm text-gray-800 dark:text-gray-100">
          <div>Sending through <strong>{status.host || 'unknown host'}</strong>{status.port ? `:${status.port}` : ''} ({status.via}) as <strong>{status.from || 'FlexHub <no-reply@localhost>'}</strong>.</div>
          {!status.from && <div className={bad}>MAIL_FROM is not set. Most providers refuse the default sender; set it to an address you have verified with them.</div>}
          {status.urlProblem && <div role="alert" className={bad}>{status.urlProblem}</div>}
          {status.check?.ok && <div className={good}>The mail server accepted the connection and login.</div>}
          {status.check && !status.check.ok && (
            <div role="alert" className={bad}>
              The mail server could not be used: {status.check.hint}
              {status.check.message && <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Server said: {status.check.message}</div>}
            </div>
          )}
          {status.lastFailure && (
            <div role="alert" className={bad}>
              Last failed send ({when(status.lastFailure.at)}): {status.lastFailure.hint}
            </div>
          )}
        </div>
      )}
      <div className="flex items-center gap-3 flex-wrap">
        <button type="button" onClick={test} disabled={testing || !status} className="border rounded-xl px-4 py-2 text-sm dark:border-gray-600 dark:text-gray-100 disabled:opacity-50">{testing ? 'Sending...' : 'Send a test email to me'}</button>
        {result?.ok && <span role="status" className={good}>Sent to {result.to}. Check your inbox (and spam).</span>}
        {result && !result.ok && <span role="alert" className={bad}>Not sent: {result.hint || result.message}</span>}
      </div>
    </section>
  );
}
