import { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useBrand } from '../context/BrandContext';

const asRgb = (triplet, fallback) => `rgb(${(triplet || fallback).trim().split(/\s+/).join(',')})`;

/**
 * Chart colours for the current theme and brand. In the dark theme the brand accent is used as it is; in the light theme it is the
 * darkened accent that reads on white (lime on white is neon and washes out). Charts draw with raw colours, not Tailwind classes.
 */
export function useChartColors() {
  const { theme } = useTheme();
  const { brand } = useBrand();
  return useMemo(() => {
    const css = getComputedStyle(document.documentElement);
    const dark = theme === 'dark';
    return {
      dark,
      accent: dark ? asRgb(css.getPropertyValue('--accent'), '200 248 58') : asRgb(css.getPropertyValue('--accent-strong'), '14 136 72'),
      danger: dark ? '#FF6B7A' : '#DC4A56',
      dotRing: dark ? '#0B0E13' : '#FFFFFF',
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, brand]);
}
