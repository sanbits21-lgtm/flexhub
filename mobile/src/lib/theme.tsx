import { createContext, Fragment, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { View, useColorScheme } from 'react-native';
import { store } from './storage';

export type Scheme = 'dark' | 'light';
/** What the person chose. Dark unless they say otherwise; 'system' follows the phone. */
export type Appearance = 'dark' | 'light' | 'system';
const PREF_KEY = 'flexhub.appearance';

// One accent (electric lime) on near-black. Status colours are tuned per scheme so text
// stays readable: lime is an accent *fill*; `link` is the readable-on-surface version.
const dark = {
  bg: '#0A0C10',
  card: '#12151B',
  surface2: '#1A1E26',
  line: 'rgba(255,255,255,0.08)',
  lineStrong: 'rgba(255,255,255,0.18)',
  ink: '#F5F7FA',
  muted: '#A3ABBC',
  faint: '#8E97AB',
  accent: '#C8F83A',
  accentInk: '#0B0E05',
  accentSoft: 'rgba(200,248,58,0.12)',
  link: '#C8F83A',
  brand: '#C8F83A',
  success: '#3DDC97',
  successSoft: 'rgba(61,220,151,0.14)',
  warn: '#FFB547',
  warnSoft: 'rgba(255,181,71,0.14)',
  danger: '#FF6B7A',
  dangerSoft: 'rgba(255,107,122,0.14)',
  info: '#7AA2FF',
  infoSoft: 'rgba(122,162,255,0.14)',
  violet: '#A596FF',
  overlay: 'rgba(0,0,0,0.65)',
  tabBar: '#0E1117',
  gradA: '#C8F83A',
  gradB: '#37D67A',
  gradInk: '#08130A',
};

const light: typeof dark = {
  bg: '#F3F4F7',
  card: '#FFFFFF',
  surface2: '#EEF0F4',
  line: 'rgba(10,12,16,0.08)',
  lineStrong: 'rgba(10,12,16,0.18)',
  ink: '#0A0C10',
  muted: '#566072',
  faint: '#667084',
  accent: '#BDF02F',
  accentInk: '#0B0E05',
  accentSoft: 'rgba(120,170,0,0.12)',
  link: '#3B6B00',
  brand: '#0A0C10',
  success: '#0E9F63',
  successSoft: 'rgba(14,159,99,0.12)',
  warn: '#B86E00',
  warnSoft: 'rgba(184,110,0,0.12)',
  danger: '#D6334A',
  dangerSoft: 'rgba(214,51,74,0.10)',
  info: '#2F5FD0',
  infoSoft: 'rgba(47,95,208,0.10)',
  violet: '#6A55E0',
  overlay: 'rgba(10,12,16,0.45)',
  tabBar: '#FFFFFF',
  gradA: '#C8F83A',
  gradB: '#37D67A',
  gradInk: '#08130A',
};

const PALETTES = { dark, light };
let current: Scheme = 'dark';

// `colors` always reads the live palette. ThemeProvider remounts the tree when the scheme
// changes, so plain `colors.x` reads at render time are always current: no hook needed.
export const colors = new Proxy({} as typeof dark, {
  get: (_t, key: string) => PALETTES[current][key as keyof typeof dark],
});

export const isDark = () => current === 'dark';

type AppearanceCtx = { appearance: Appearance; setAppearance: (a: Appearance) => void };
const AppearanceContext = createContext<AppearanceCtx>({ appearance: 'dark', setAppearance: () => {} });
export const useAppearance = () => useContext(AppearanceContext);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [appearance, setAppearanceState] = useState<Appearance>('dark');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    store.get(PREF_KEY).then((v) => { if (v === 'light' || v === 'system' || v === 'dark') setAppearanceState(v); }).catch(() => {}).finally(() => setLoaded(true));
  }, []);

  const scheme: Scheme = appearance === 'system' ? (system === 'light' ? 'light' : 'dark') : appearance;
  current = scheme;

  const value = useMemo<AppearanceCtx>(() => ({
    appearance,
    setAppearance: (a) => { setAppearanceState(a); store.set(PREF_KEY, a).catch(() => {}); },
  }), [appearance]);

  // Wait for the saved choice so a light-mode user does not see a dark flash on every launch.
  if (!loaded) return <View style={{ flex: 1, backgroundColor: PALETTES.dark.bg }} />;
  return <AppearanceContext.Provider value={value}><Fragment key={scheme}>{children}</Fragment></AppearanceContext.Provider>;
}

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };
