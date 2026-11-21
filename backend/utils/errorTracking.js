// Error tracking (Sentry), optional and privacy-first.
//
// Off unless SENTRY_DSN is set, so nothing changes until you choose a project. It adds to the error emails (utils/alerts), it
// does not replace them: Sentry groups the same error, counts it, shows the release it began in and keeps the history.
//
// What leaves the server is only: the error, its stack, the route that failed, the release and the environment. Never a request
// body, query string, header, cookie, IP address or any person's data: this app holds members' phone numbers and health notes.
// `scrub` removes those even if a library tries to attach them.

let sentry = null;

const SAFE_REQUEST_KEYS = ['method', 'url'];

/** Strips everything about the visitor from an event. Exported so a test can pin it. */
const scrub = (event) => {
  if (!event) return event;
  if (event.request) {
    const kept = {};
    for (const key of SAFE_REQUEST_KEYS) if (event.request[key]) kept[key] = String(event.request[key]).split('?')[0]; // no query string
    event.request = kept;
  }
  delete event.user;
  delete event.server_name;
  if (event.contexts) delete event.contexts.device;
  if (event.breadcrumbs) {
    // Breadcrumbs can carry logged text or URLs with ids and tokens; keep only that something happened.
    event.breadcrumbs = event.breadcrumbs.map((b) => ({ category: b.category, level: b.level, timestamp: b.timestamp }));
  }
  if (event.extra) event.extra = {};
  return event;
};

const enabled = () => !!sentry;

/** Starts Sentry when SENTRY_DSN is set. Safe to call once, early; does nothing without a DSN. */
const init = () => {
  const dsn = String(process.env.SENTRY_DSN || '').trim();
  if (!dsn || sentry) return false;
  try {
    const Sentry = require('@sentry/node');
    Sentry.init({
      dsn,
      environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
      release: process.env.RENDER_GIT_COMMIT || process.env.SENTRY_RELEASE || undefined,
      sendDefaultPii: false,
      tracesSampleRate: 0, // errors only: no performance traces, no extra overhead
      maxBreadcrumbs: 20,
      beforeSend: scrub,
    });
    sentry = Sentry;
    return true;
  } catch (err) {
    console.error('Sentry could not start:', err.message); // an error tracker must never stop the server
    return false;
  }
};

/** Reports an error with the route it came from. Never throws. */
const capture = (err, where = 'server') => {
  if (!sentry) return false;
  try {
    sentry.withScope((scope) => {
      scope.setTag('where', String(where).slice(0, 120));
      sentry.captureException(err instanceof Error ? err : new Error(String(err)));
    });
    return true;
  } catch {
    return false;
  }
};

/** Waits (briefly) for queued reports to be sent: used right before the process exits after a crash. */
const flush = async (ms = 2000) => {
  if (!sentry) return;
  try { await sentry.flush(ms); } catch { /* shutting down anyway */ }
};

module.exports = { init, capture, flush, enabled, scrub };
