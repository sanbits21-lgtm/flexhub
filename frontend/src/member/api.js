import axios from 'axios';

// The member app has its own API client and its own session, apart from the staff website's, so a
// gym owner signed in on this browser and a member signed in on it never see each other's session.
//
// The short-lived access token lives only in memory. The refresh token is an httpOnly cookie the
// page cannot read, and renews the access token (see backend/utils/sessions.js). What IS kept in
// localStorage is the non-secret saved copy of the member's screens, so the app opens offline.
export const SESSION_KEY = 'member:session';

export const memberApi = axios.create({ baseURL: '/api', headers: { 'X-Requested-With': 'flexhub' } });

let accessToken = null;
export const getMemberToken = () => accessToken;
export const setMemberToken = (t) => { accessToken = t; };

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

const hasSavedSession = () => { try { return !!localStorage.getItem(SESSION_KEY); } catch { return false; } };
const isAuthCall = (url = '') => /\/member-auth\/(login|refresh|logout)/.test(url);

// One refresh at a time: requests that expire together share it (a second would present a refresh
// token that was just used).
let refreshing = null;
export const refreshMemberToken = () => {
  if (!refreshing) {
    refreshing = axios.post('/api/member-auth/refresh', {}, { headers: { 'X-Requested-With': 'flexhub' } })
      .then((res) => { setMemberToken(res.data.token); return res.data.token; })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
};

memberApi.interceptors.request.use(async (config) => {
  // A phone that opened the app offline has no access token yet; get one on the first request
  // that can reach the server. Offline, the request just fails and the saved copy is shown.
  if (!accessToken && !isAuthCall(config.url) && hasSavedSession()) {
    try { await refreshMemberToken(); } catch (err) { if (err.response?.status === 401) onUnauthorized(); }
  }
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

// A session that no longer works ends at once. A failed sign-in (a login call, with nothing
// signed in yet) is just a wrong password and must not.
memberApi.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { response, config } = error;
    if (response?.status === 401 && response.data?.code === 'TOKEN_EXPIRED' && config && !config._retried && !isAuthCall(config.url)) {
      let token = null;
      try {
        token = await refreshMemberToken();
      } catch (refreshError) {
        if (!refreshError.response) return Promise.reject(error); // offline: keep the session
      }
      if (token) {
        config._retried = true;
        config.headers.Authorization = `Bearer ${token}`;
        return memberApi(config); // whatever this answers (even an error) is the answer to the caller
      }
    }
    if (response?.status === 401 && !isAuthCall(config?.url) && (accessToken || hasSavedSession())) onUnauthorized();
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
  setMemberToken(null);
  try {
    Object.keys(localStorage).filter((k) => k === SESSION_KEY || k === 'member:token' || k.startsWith('member:cache:')).forEach((k) => localStorage.removeItem(k));
  } catch { /* storage unavailable */ }
};
