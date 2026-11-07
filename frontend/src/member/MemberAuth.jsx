import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { memberApi, SESSION_KEY, clearMemberStorage, refreshMemberToken, setMemberToken, setUnauthorizedHandler } from './api';
import { useBrand } from '../context/BrandContext';

const Ctx = createContext(null);

const readSession = () => {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
};

export function MemberAuthProvider({ children }) {
  const saved = readSession();
  // Open straight into the app from the saved session, even offline; it is confirmed below.
  const [member, setMember] = useState(saved ? saved.member : null);
  const [features, setFeatures] = useState(saved ? saved.features || {} : {});
  const [ready, setReady] = useState(!!saved);
  const { setBrand } = useBrand();

  const remember = useCallback((m, f, brand) => {
    setMember(m);
    setFeatures(f || {});
    try { localStorage.setItem(SESSION_KEY, JSON.stringify({ member: m, features: f || {}, brand: brand || null })); } catch { /* storage unavailable */ }
    if (brand) setBrand(brand);
  }, [setBrand]);

  const signOut = useCallback(async () => {
    // Tell the server first (it ends this login and clears the cookie), but never wait long for it.
    await Promise.race([memberApi.post('/member-auth/logout').catch(() => {}), new Promise((resolve) => setTimeout(resolve, 1000))]);
    clearMemberStorage();
    // A full load, so the gym's own address re-brands the login page and nothing of the member stays in memory.
    window.location.assign('/member/login');
  }, []);

  useEffect(() => { setUnauthorizedHandler(signOut); }, [signOut]);

  useEffect(() => {
    try { localStorage.removeItem('member:token'); } catch { /* storage unavailable */ } // the long-lived token of older versions
    if (saved?.brand) setBrand(saved.brand);
    // The access token lives only in memory, so every start renews it from the refresh cookie and
    // then confirms who is signed in. With no connection the saved copy simply stays on screen.
    (async () => {
      try {
        await refreshMemberToken();
        const res = await memberApi.get('/member-auth/me');
        remember(res.data.member, res.data.features, res.data.brand);
      } catch (err) {
        // Only a refusal ends the session; no answer (offline) or a server hiccup does not.
        if (err.response?.status === 401) { clearMemberStorage(); setMember(null); setFeatures({}); }
      } finally {
        setReady(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = async (identifier, password) => {
    const { data } = await memberApi.post('/member-auth/login', { identifier: identifier.trim(), password });
    setMemberToken(data.token);
    remember(data.member, data.features, data.brand);
  };

  const value = useMemo(() => ({
    ready,
    member,
    /** A gym can switch features off; a feature is on unless it is explicitly false. */
    can: (feature) => features[feature] !== false,
    signIn,
    signOut,
    updateName: (name) => setMember((m) => (m ? { ...m, name } : m)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [ready, member, features, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useMemberAuth = () => useContext(Ctx);
