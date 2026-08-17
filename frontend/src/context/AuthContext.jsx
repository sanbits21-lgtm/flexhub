import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // Resolved per-tenant feature flags (backend/utils/features.js resolveFeatures) for
  // tenant-scoped roles; undefined for super-admin/platform-admin, who are never gated —
  // useFeature() treats "absent" as always-on, matching the backend.
  const [features, setFeatures] = useState(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    authAPI.me()
      .then((res) => { setUser(res.data.user); setFeatures(res.data.features); })
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const res = await authAPI.login(email, password);
    localStorage.setItem('token', res.data.token);
    setUser(res.data.user);
    setFeatures(res.data.features);
    return res.data.user;
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    setFeatures(undefined);
  };

  return (
    <AuthContext.Provider value={{ user, features, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
