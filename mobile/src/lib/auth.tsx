import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, api, setToken, setUnauthorizedHandler } from './api';
import { store } from './storage';

export type Role = 'member' | 'trainer' | 'branch-manager' | 'tenant-admin';
export const isManagerRole = (r: Role | null): r is 'branch-manager' | 'tenant-admin' => r === 'branch-manager' || r === 'tenant-admin';
const STAFF_ROLES: Role[] = ['trainer', 'branch-manager', 'tenant-admin'];

const TOKEN_KEY = 'flexhub.token';
const ROLE_KEY = 'flexhub.role';
const NAME_KEY = 'flexhub.name';

type Features = Record<string, boolean>;
type AuthState = {
  ready: boolean;
  role: Role | null;
  name: string;
  /** A gym can switch features off; a feature is on unless it is explicitly false. */
  can: (feature: string) => boolean;
  signIn: (identifier: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};
const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [role, setRole] = useState<Role | null>(null);
  const [name, setName] = useState('');
  const [features, setFeatures] = useState<Features>({});

  const signOut = async () => {
    setToken(null);
    await Promise.all([TOKEN_KEY, ROLE_KEY, NAME_KEY].map((k) => store.del(k).catch(() => {})));
    setRole(null);
    setName('');
    setFeatures({});
  };

  useEffect(() => {
    setUnauthorizedHandler(() => { void signOut(); });
    (async () => {
      try {
        const [token, savedRole, savedName] = await Promise.all([store.get(TOKEN_KEY), store.get(ROLE_KEY), store.get(NAME_KEY)]);
        if (token && savedRole && (savedRole === 'member' || STAFF_ROLES.includes(savedRole as Role))) {
          setToken(token);
          setRole(savedRole as Role);
          setName(savedName ?? '');
          // Staff: refresh which features the gym has on (also proves the token is still good).
          const meUrl = savedRole === 'member' ? '/member-auth/me' : '/auth/me';
          api.get<{ features?: Features }>(meUrl).then((r) => setFeatures(r.features ?? {})).catch(() => {});
        }
      } catch { /* unreadable store: start signed out */ }
      setReady(true);
    })();
  }, []);

  const value = useMemo<AuthState>(() => ({
    ready,
    role,
    name,
    can: (feature) => features[feature] !== false,
    signIn: async (rawIdentifier, password) => {
      const identifier = rawIdentifier.trim();
      let result: { token: string; role: Role; name: string; features?: Features };
      try {
        // Members sign in with a member code or email; try that first.
        const m = await api.post<{ token: string; member: { name: string }; features?: Features }>('/member-auth/login', { identifier, password });
        result = { token: m.token, role: 'member', name: m.member.name, features: m.features };
      } catch (memberErr) {
        // Staff sign in with their email. Anything that is not an email can only be a member code.
        if (!(memberErr instanceof ApiError) || memberErr.status !== 401 || !identifier.includes('@')) throw memberErr;
        const s = await api.post<{ token: string; user: { name: string; role: string }; features?: Features }>('/auth/login', { email: identifier, password });
        if (!STAFF_ROLES.includes(s.user.role as Role)) {
          throw new ApiError('This account is for the FlexHub website. The app is for members, trainers and gym managers.', 403);
        }
        result = { token: s.token, role: s.user.role as Role, name: s.user.name, features: s.features };
      }
      setToken(result.token);
      await Promise.all([store.set(TOKEN_KEY, result.token), store.set(ROLE_KEY, result.role), store.set(NAME_KEY, result.name)]);
      setFeatures(result.features ?? {});
      setRole(result.role);
      setName(result.name);
    },
    signOut,
  }), [ready, role, name, features]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
};
