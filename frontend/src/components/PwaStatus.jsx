import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import InstallBanner from './InstallBanner';

// App-wide PWA feedback, mounted once in main.jsx (outside the router/auth-gated
// AppLayout) so all of it — including the install nudge — is visible on /login too,
// not just after signing in:
//
//  - an update prompt, because registerType is 'prompt' — a new build never reloads the
//    page out from under someone mid-form, it waits to be told.
//  - an offline banner, because the service worker caches the app shell but deliberately
//    caches no API data. Without this, going offline looks like the app is broken rather
//    than the network being gone.
//  - the mobile install banner (see InstallBanner.jsx) — stacked below the offline strip
//    when both are showing, sharing one safe-area-aware wrapper so the padding isn't
//    applied twice.
export default function PwaStatus() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return (
    <>
      <div className="fixed top-0 inset-x-0 z-[60] flex flex-col pt-safe">
        {offline && (
          <div className="bg-amber-500 text-amber-950 text-sm text-center py-1 px-3">
            You're offline — data won't load or save until the connection is back.
          </div>
        )}
        <InstallBanner />
      </div>

      {needRefresh && (
        <div className="fixed bottom-4 inset-x-4 z-[60] md:left-auto md:right-4 md:w-80 rounded-lg shadow-lg bg-gray-900 text-gray-100 dark:bg-gray-100 dark:text-gray-900 p-4 pb-safe">
          <p className="text-sm mb-3">A new version of FlexHub is available.</p>
          <div className="flex gap-2">
            <button
              onClick={() => updateServiceWorker(true)}
              className="rounded px-3 py-1.5 text-sm bg-gray-100 text-gray-900 dark:bg-gray-900 dark:text-gray-100"
            >
              Reload
            </button>
            <button
              onClick={() => setNeedRefresh(false)}
              className="rounded px-3 py-1.5 text-sm border border-gray-600 dark:border-gray-400"
            >
              Later
            </button>
          </div>
        </div>
      )}
    </>
  );
}
