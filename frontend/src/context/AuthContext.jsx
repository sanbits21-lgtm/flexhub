import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI, refreshAccessToken } from '../services/api';
import { setToken } from '../services/authToken';
import { useBrand } from './BrandContext';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // Resolved per-tenant feature flags (backend/utils/features.js resolveFeatures) for
  // tenant-scoped roles; undefined for super-admin/platform-admin, who are never gated —
  // useFeature() treats "absent" as always-on, matching the backend.
  const [features, setFeatures] = useState(undefined);
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState(undefined);
  const { brand: hostBrand, setBrand } = useBrand();

  useEffect(() => {
    try { localStorage.removeItem('token'); } catch { /* storage unavailable */ } // the long-lived token of older versions
    // The access token lives only in memory, so a page load starts by renewing it from the refresh
    // cookie. No cookie (never signed in, or signed out) simply means "not logged in".
    refreshAccessToken()
      .then(() => authAPI.me())
      .then((res) => { setUser(res.data.user); setFeatures(res.data.features); setSubscription(res.data.subscription); if (res.data.brand) setBrand(res.data.brand); })
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const res = await authAPI.login(email, password);
    setToken(res.data.token);
    setUser(res.data.user);
    setFeatures(res.data.features);
    setSubscription(res.data.subscription);
    if (res.data.brand) setBrand(res.data.brand);
    return res.data.user;
  };

  // After something about yourself changes (your picture), without signing in again.
  const updateUser = (patch) => setUser((u) => (u ? { ...u, ...patch } : u));

  const logout = () => {
    authAPI.logout().catch(() => {}); // ends this login on the server and clears the cookie
    setToken(null);
    setUser(null);
    setFeatures(undefined);
    setSubscription(undefined);
    if (!hostBrand) setBrand(null); // main address: back to the FlexHub look
  };

  return (
    <AuthContext.Provider value={{ user, features, subscription, loading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
