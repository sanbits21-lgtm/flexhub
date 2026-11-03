import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';
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
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    authAPI.me()
      .then((res) => { setUser(res.data.user); setFeatures(res.data.features); setSubscription(res.data.subscription); if (res.data.brand) setBrand(res.data.brand); })
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const res = await authAPI.login(email, password);
    localStorage.setItem('token', res.data.token);
    setUser(res.data.user);
    setFeatures(res.data.features);
    setSubscription(res.data.subscription);
    if (res.data.brand) setBrand(res.data.brand);
    return res.data.user;
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    setFeatures(undefined);
    setSubscription(undefined);
    if (!hostBrand) setBrand(null); // main address: back to the FlexHub look
  };

  return (
    <AuthContext.Provider value={{ user, features, subscription, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
