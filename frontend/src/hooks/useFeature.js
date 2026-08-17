import { useAuth } from '../context/AuthContext';

// Reads the resolved per-tenant feature flags from AuthContext (populated by
// backend/controllers/authController.js on login/me). `features` is undefined for
// super-admin/platform-admin — they're never gated, so this defaults to true rather
// than false when there's nothing to check against.
export const useFeature = (key) => {
  const { features } = useAuth();
  if (!features) return true;
  return features[key] !== false;
};
