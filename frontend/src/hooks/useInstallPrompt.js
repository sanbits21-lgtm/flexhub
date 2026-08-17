import { useEffect, useState } from 'react';

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

const isIos = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent);

// Shared by InstallButton (sidebar link, all devices) and InstallBanner (mobile-only,
// dismissible). One listener, one source of truth, so both stay in sync when the app
// gets installed from wherever the user actually clicked.
//
// Chrome/Edge/Android fire `beforeinstallprompt`, which is stashed and replayed on
// demand via promptInstall(). iOS Safari fires nothing and has no programmatic install
// at all, so `isIos` is exposed for callers to show a manual "Share → Add to Home
// Screen" hint instead.
export const useInstallPrompt = () => {
  const [promptEvent, setPromptEvent] = useState(null);
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    const onBeforeInstall = (e) => {
      e.preventDefault(); // keeps Chrome from showing its own mini-infobar
      setPromptEvent(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (!promptEvent) return null;
    promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    // The event is single-use — Chrome will fire a fresh one later if the user declines
    // and becomes eligible again (e.g. after using the app more).
    setPromptEvent(null);
    if (outcome === 'accepted') setInstalled(true);
    return outcome;
  };

  return { installed, isIos: isIos(), canPrompt: !!promptEvent, promptInstall };
};
