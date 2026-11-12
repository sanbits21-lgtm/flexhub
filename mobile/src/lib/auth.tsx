import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError, api, setRefresher, setToken, setUnauthorizedHandler } from './api';
import { store } from './storage';

export type Role = 'member' | 'trainer' | 'branch-manager' | 'tenant-admin';
export const isManagerRole = (r: Role | null): r is 'branch-manager' | 'tenant-admin' => r === 'branch-manager' || r === 'tenant-admin';
const STAFF_ROLES: Role[] = ['trainer', 'branch-manager', 'tenant-admin'];

const TOKEN_KEY = 'flexhub.token';
const ROLE_KEY = 'flexhub.role';
const NAME_KEY = 'flexhub.name';
const REFRESH_KEY = 'flexhub.refresh';

type Features = Record<string, boolean>;
type AuthState = {
  ready: boolean;
  role: Role | null;
  name: string;
  /** A gym can switch features off; a feature is on unless it is explicitly false. */
  can: (feature: string) => boolean;
  signIn: (identifier: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** After a password change the server signs every other device out and issues this one a new token. */
  replaceToken: (token: string) => Promise<void>;
};
const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [role, setRole] = useState<Role | null>(null);
  const [name, setName] = useState('');
  const [features, setFeatures] = useState<Features>({});
  // The refresher runs outside React's render cycle, so it reads the role from a ref.
  const roleRef = useRef<Role | null>(null);
  const inflight = useRef<Promise<boolean> | null>(null);

  // Trades the stored refresh token for a new access + refresh token. Several calls expiring
  // together share one trade (a second would present a token that was just used).
  const refreshOnce = async (): Promise<boolean> => {
    const refreshToken = await store.get(REFRESH_KEY);
    if (!refreshToken) return false;
    const path = roleRef.current === 'member' ? '/member-auth/refresh' : '/auth/refresh';
    try {
      const r = await api.post<{ token: string; refreshToken?: string }>(path, { refreshToken });
      setToken(r.token);
      await store.set(TOKEN_KEY, r.token);
      if (r.refreshToken) await store.set(REFRESH_KEY, r.refreshToken);
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 0) throw e; // offline: keep the session, try again later
      return false;
    }
  };

  const signOut = async () => {
    // Ask the server to end this login too (best effort: it must not hold up signing out).
    const refreshToken = await store.get(REFRESH_KEY).catch(() => null);
    if (refreshToken) api.post(roleRef.current === 'member' ? '/member-auth/logout' : '/auth/logout', { refreshToken }).catch(() => {});
    roleRef.current = null;
    setToken(null);
    await Promise.all([TOKEN_KEY, ROLE_KEY, NAME_KEY, REFRESH_KEY].map((k) => store.del(k).catch(() => {})));
    setRole(null);
    setName('');
    setFeatures({});
  };

  useEffect(() => {
    setUnauthorizedHandler(() => { void signOut(); });
    setRefresher(() => {
      if (!inflight.current) inflight.current = refreshOnce().finally(() => { inflight.current = null; });
      return inflight.current;
    });
    (async () => {
      try {
        const [token, savedRole, savedName] = await Promise.all([store.get(TOKEN_KEY), store.get(ROLE_KEY), store.get(NAME_KEY)]);
        if (token && savedRole && (savedRole === 'member' || STAFF_ROLES.includes(savedRole as Role))) {
          setToken(token);
          roleRef.current = savedRole as Role;
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
      let result: { token: string; refreshToken?: string; role: Role; name: string; features?: Features };
      try {
        // Members sign in with a member code or email; try that first.
        const m = await api.post<{ token: string; refreshToken?: string; member: { name: string }; features?: Features }>('/member-auth/login', { identifier, password });
        result = { token: m.token, refreshToken: m.refreshToken, role: 'member', name: m.member.name, features: m.features };
      } catch (memberErr) {
        // Staff sign in with their email. Anything that is not an email can only be a member code.
        // A locked member side (429) does not stop a staff sign-in: staff always pass through it first.
        if (!(memberErr instanceof ApiError) || (memberErr.status !== 401 && memberErr.status !== 429) || !identifier.includes('@')) throw memberErr;
        let s: { token: string; refreshToken?: string; user: { name: string; role: string }; features?: Features };
        try {
          s = await api.post<{ token: string; refreshToken?: string; user: { name: string; role: string }; features?: Features }>('/auth/login', { email: identifier, password });
        } catch (staffErr) {
          // Not staff either: a member locked out should be told so, not "wrong password".
          if (memberErr.status === 429 && staffErr instanceof ApiError && staffErr.status === 401) throw memberErr;
          throw staffErr;
        }
        if (!STAFF_ROLES.includes(s.user.role as Role)) {
          throw new ApiError('This account is for the FitzyClub website. The app is for members, trainers and gym managers.', 403);
        }
        result = { token: s.token, refreshToken: s.refreshToken, role: s.user.role as Role, name: s.user.name, features: s.features };
      }
      setToken(result.token);
      roleRef.current = result.role;
      await Promise.all([
        store.set(TOKEN_KEY, result.token), store.set(ROLE_KEY, result.role), store.set(NAME_KEY, result.name),
        result.refreshToken ? store.set(REFRESH_KEY, result.refreshToken) : store.del(REFRESH_KEY),
      ]);
      setFeatures(result.features ?? {});
      setRole(result.role);
      setName(result.name);
    },
    signOut,
    replaceToken: async (t) => { setToken(t); await store.set(TOKEN_KEY, t); },
  }), [ready, role, name, features]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
};
