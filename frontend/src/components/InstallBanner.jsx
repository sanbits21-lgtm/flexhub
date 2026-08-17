import { useEffect, useState } from 'react';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

const DISMISS_KEY = 'installBannerDismissed';

// A more prominent, mobile-only companion to the small InstallButton link in the
// sidebar — "optional" means dismissible, not that it disappears on its own. Once
// closed it stays closed (remembered in localStorage, same pattern as the theme
// preference in index.html) rather than nagging on every visit.
//
// Mobile-only via the same md:hidden convention the mobile header already uses
// (App.jsx) — no separate viewport-width JS needed.
export default function InstallBanner() {
  const { installed, isIos, canPrompt, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === 'true');

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, 'true');
    setDismissed(true);
  };

  useEffect(() => {
    // A fresh appinstalled event (installed via the sidebar link, say) should hide
    // this too, without needing a page reload.
    if (installed) setDismissed(true);
  }, [installed]);

  if (installed || dismissed) return null;
  // Nothing to offer yet: not iOS (which always has the manual path) and no captured
  // beforeinstallprompt (not eligible, or already dismissed by the browser this session).
  if (!isIos && !canPrompt) return null;

  return (
    <div className="md:hidden mx-4 mt-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm p-3 flex items-start gap-3">
      <img src="/icons/icon-192.png" alt="" className="w-10 h-10 rounded-lg shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Install FlexHub</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {isIos
            ? <>Tap <span className="font-medium">Share</span>, then <span className="font-medium">Add to Home Screen</span>.</>
            : 'Add it to your home screen for quicker, full-screen access.'}
        </p>
        {!isIos && (
          <button
            onClick={promptInstall}
            className="mt-2 text-sm bg-gray-900 text-white rounded px-3 py-1.5 dark:bg-gray-100 dark:text-gray-900"
          >
            Install
          </button>
        )}
      </div>
      <button onClick={dismiss} aria-label="Dismiss" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 shrink-0">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
