import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Generalizes PrivateRoute/AdminRoute into one guard parameterized by allowed roles.
// Omit `allow` to require only that the user is authenticated (any role).
export default function RoleRoute({ allow, children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (allow && !allow.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}
