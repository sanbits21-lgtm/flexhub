import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { memberApi, TOKEN_KEY, SESSION_KEY, clearMemberStorage, setUnauthorizedHandler } from './api';
import { useBrand } from '../context/BrandContext';

const Ctx = createContext(null);

const readSession = () => {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
};

export function MemberAuthProvider({ children }) {
  const saved = readSession();
  const hasToken = !!localStorage.getItem(TOKEN_KEY);
  // Open straight into the app from the saved session, even offline; it is confirmed below.
  const [member, setMember] = useState(hasToken && saved ? saved.member : null);
  const [features, setFeatures] = useState(hasToken && saved ? saved.features || {} : {});
  const [ready, setReady] = useState(!hasToken || !!saved);
  const { setBrand } = useBrand();

  const remember = useCallback((m, f, brand) => {
    setMember(m);
    setFeatures(f || {});
    try { localStorage.setItem(SESSION_KEY, JSON.stringify({ member: m, features: f || {}, brand: brand || null })); } catch { /* storage unavailable */ }
    if (brand) setBrand(brand);
  }, [setBrand]);

  const signOut = useCallback(() => {
    clearMemberStorage();
    // A full load, so the gym's own address re-brands the login page and nothing of the member stays in memory.
    window.location.assign('/member/login');
  }, []);

  useEffect(() => { setUnauthorizedHandler(signOut); }, [signOut]);

  useEffect(() => {
    if (!hasToken) return;
    if (saved?.brand) setBrand(saved.brand);
    memberApi.get('/member-auth/me')
      .then((res) => remember(res.data.member, res.data.features, res.data.brand))
      .catch((err) => { if (err.response?.status === 401) return; /* handled by the interceptor */ })
      .finally(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = async (identifier, password) => {
    const { data } = await memberApi.post('/member-auth/login', { identifier: identifier.trim(), password });
    localStorage.setItem(TOKEN_KEY, data.token);
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
