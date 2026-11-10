import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { tenantSettingsAPI } from '../../services/api';

// A QR code the gym shows (printed at the front desk, or full screen on the manager's computer)
// so a member can point their phone at it and land on the member app, instead of typing an address.
// The code holds only the public address of the app: no member data, and it never expires.
export default function MemberAppQr() {
  const [link, setLink] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [big, setBig] = useState(false);

  useEffect(() => {
    tenantSettingsAPI.memberAppLink().then((res) => setLink(res.data)).catch(() => setError('Could not load the link. Try again.'));
  }, []);

  const copy = async () => {
    try { await navigator.clipboard.writeText(link.url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ }
  };

  const btn = 'rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-700';
  if (error) return <div className="p-6 text-sm text-red-600 dark:text-red-400" role="alert">{error}</div>;
  if (!link) return <div className="p-6 text-sm text-gray-500 dark:text-gray-400">Loading…</div>;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Member App QR</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Members scan this with their phone camera to open the member app. Print it for the front desk, or show it full screen.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-[auto,1fr]">
        <div className="receipt-print-area poster-print flex flex-col items-center rounded-xl border border-gray-200 bg-white p-6 text-center text-gray-900 dark:border-gray-700">
          <p className="text-2xl font-bold">{link.gymName}</p>
          <p className="mt-1 text-sm uppercase tracking-widest text-gray-500">Member app</p>
          <div className="my-5 rounded-lg bg-white p-3">
            <QRCodeSVG value={link.url} size={280} level="M" marginSize={1} bgColor="#ffffff" fgColor="#000000" title="QR code that opens the member app" />
          </div>
          <p className="text-base font-semibold">Scan to open the member app</p>
          <p className="mt-1 max-w-xs text-sm text-gray-600">Point your phone camera at the code. Sign in with your member ID, then tap Share or the browser menu and choose Add to Home Screen.</p>
          <p className="mt-3 break-all font-mono text-xs text-gray-500">{link.url}</p>
        </div>

        <div className="no-print space-y-4">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => window.print()} className={btn}>Print poster</button>
            <button type="button" onClick={() => setBig(true)} className={btn}>Show full screen</button>
            <button type="button" onClick={copy} className={btn}>{copied ? 'Copied!' : 'Copy link'}</button>
          </div>
          <div className="rounded-lg border border-gray-200 p-4 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-200">
            <p className="font-semibold">How members use it</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Open the phone camera and point it at the code.</li>
              <li>Tap the link that appears. The member app opens.</li>
              <li>Sign in with the member ID the front desk gave them.</li>
              <li>Add it to the home screen to open it like any other app.</li>
            </ol>
            <p className="mt-3 text-gray-500 dark:text-gray-400">The code opens the sign-in page only. It does not sign anyone in, and it never expires.</p>
          </div>
        </div>
      </div>

      {big && (
        <div className="no-print fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-white p-6 text-gray-900" role="dialog" aria-label="Member app QR code">
          <p className="text-3xl font-bold">{link.gymName}</p>
          <QRCodeSVG value={link.url} size={Math.min(520, window.innerWidth - 64)} level="M" marginSize={1} bgColor="#ffffff" fgColor="#000000" />
          <p className="text-lg font-semibold">Scan to open the member app</p>
          <button type="button" onClick={() => setBig(false)} className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-100">Close</button>
        </div>
      )}
    </div>
  );
}
