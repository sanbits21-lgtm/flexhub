import { useState } from 'react';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

// Small, always-available link in the sidebar footer — the discoverable-but-quiet path
// for anyone (desktop included) who wants to install without waiting for the mobile
// banner. See InstallBanner.jsx for the more prominent, mobile-only, dismissible prompt.
export default function InstallButton() {
  const { installed, isIos, canPrompt, promptInstall } = useInstallPrompt();
  const [showIosHint, setShowIosHint] = useState(false);

  if (installed) return null;

  if (isIos) {
    return (
      <div className="text-xs text-gray-400">
        <button onClick={() => setShowIosHint((v) => !v)} className="hover:text-gray-200">
          Install app
        </button>
        {showIosHint && <p className="mt-1 leading-snug">Tap Share, then “Add to Home Screen”.</p>}
      </div>
    );
  }

  if (!canPrompt) return null;

  return (
    <button onClick={promptInstall} className="text-xs text-gray-400 hover:text-gray-200">
      Install app
    </button>
  );
}
