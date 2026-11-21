// Browser error tracking (Sentry), optional and privacy-first. Off unless the site was built with a DSN (SENTRY_DSN in the
// build environment; see the Dockerfile). Mirrors backend/utils/errorTracking.js: what leaves the browser is the error, its stack
// and the page path, never what someone typed, a query string, a cookie, or any person's data.

/** Strips everything about the person from an event. Exported so a test can pin it. */
export const scrub = (event) => {
  if (!event) return event;
  if (event.request) {
    const kept = {};
    if (event.request.url) kept.url = String(event.request.url).split('?')[0].split('#')[0]; // no query string, no fragment
    event.request = kept;
  }
  delete event.user;
  if (event.breadcrumbs) event.breadcrumbs = [];
  if (event.extra) event.extra = {};
  return event;
};

/** Loads and starts Sentry only when there is a DSN, so a build without one carries none of it. */
export const startErrorTracking = (dsn = import.meta.env.VITE_SENTRY_DSN) => {
  if (!dsn) return Promise.resolve(false);
  return import('@sentry/react')
    .then((Sentry) => {
      Sentry.init({
        dsn,
        environment: import.meta.env.MODE,
        sendDefaultPii: false,
        tracesSampleRate: 0,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0, // a screen recording would capture member details
        beforeSend: scrub,
        beforeBreadcrumb: () => null, // clicks and typed-text labels can carry names
      });
      return true;
    })
    .catch(() => false); // a tracker that fails to load must never break the site
};
