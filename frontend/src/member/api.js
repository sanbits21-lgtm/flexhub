import axios from 'axios';

// The member app has its own API client and its own token, apart from the staff website's, so a
// gym owner signed in on this browser and a member signed in on it never see each other's session.
export const TOKEN_KEY = 'member:token';
export const SESSION_KEY = 'member:session';

export const memberApi = axios.create({ baseURL: '/api' });

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

memberApi.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// A token that no longer works ends the session at once. A failed sign-in (401 with no token
// yet) is just a wrong password and must not.
memberApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && localStorage.getItem(TOKEN_KEY)) onUnauthorized();
    return Promise.reject(error);
  },
);

/** The server's own words when it answered; a plain "offline" line when nothing came back. */
export const errorText = (err, fallback = 'Something went wrong. Please try again.') => {
  if (err?.response) return err.response.data?.message || fallback;
  if (err?.request) return 'You seem to be offline. Check your connection and try again.';
  return err?.message || fallback;
};

/** Everything stored for the signed-in member (session, saved copies of screens). */
export const clearMemberStorage = () => {
  try {
    Object.keys(localStorage).filter((k) => k === TOKEN_KEY || k === SESSION_KEY || k.startsWith('member:cache:')).forEach((k) => localStorage.removeItem(k));
  } catch { /* storage unavailable */ }
};
