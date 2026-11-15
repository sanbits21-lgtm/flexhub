// A scanned QR code held in front of the camera is read many times a second. Every read of a valid pass is a check-in, and a
// second read while the member is inside is a check-OUT, so without a guard one scan would flip them in and out repeatedly.

/** The very same code is ignored for this long after it was handled... */
export const SAME_CODE_MS = 15000;
/** ...and for as long as it stays in view: it must leave the camera for this long before it can count again. */
export const STILL_IN_VIEW_MS = 3000;

/**
 * Should this read be acted on? `last` is the previous handled code, { token, at, seenAt }: when it was handled and when the
 * camera last saw it (every read of it, handled or not, refreshes seenAt). A phone left in front of the camera is read again
 * and again, so "still in view" is never a new scan, however long it stays.
 */
export const shouldHandle = ({ last, token, now = Date.now() }) => {
  if (!last || last.token !== token) return true;
  if (now - (last.seenAt ?? last.at) < STILL_IN_VIEW_MS) return false;
  return now - last.at >= SAME_CODE_MS;
};

/** A FitzyClub pass is a signed token: three dot-separated parts of URL-safe characters. Anything else is some other QR code. */
export const looksLikePass = (text) => typeof text === 'string' && text.length >= 20 && text.length <= 1000 && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(text);

/** A plain-words line for what the camera could not do, from the browser's error. */
export const cameraProblem = (err, { secure = true } = {}) => {
  if (!secure) return 'The camera only works on a secure (https) address.';
  const name = err?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'The camera is blocked. Allow the camera for this site in your browser settings, then try again.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this device.';
  if (name === 'NotReadableError') return 'The camera is being used by another app. Close it and try again.';
  return 'Could not start the camera.';
};
