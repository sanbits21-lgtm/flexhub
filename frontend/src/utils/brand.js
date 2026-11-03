// Turns a gym's brand colour into the three CSS variables the theme uses.
const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const luminance = ([r, g, b]) => {
  const f = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const mixWithWhite = (rgb, t) => rgb.map((v) => Math.round(v + (255 - v) * t));

export const DEFAULT_ACCENT = '#C8F83A';

/** Sets (or, with no colour, resets) the accent. Text on the accent is black or white, whichever reads better. */
export function applyAccent(hex) {
  const root = document.documentElement.style;
  if (!/^#[0-9a-fA-F]{6}$/.test(hex || '')) {
    ['--accent', '--accent-hover', '--accent-ink'].forEach((k) => root.removeProperty(k));
    return;
  }
  const rgb = hexToRgb(hex);
  const dark = luminance(rgb) > 0.4; // bright colour -> dark text
  root.setProperty('--accent', rgb.join(' '));
  root.setProperty('--accent-hover', mixWithWhite(rgb, 0.25).join(' '));
  root.setProperty('--accent-ink', dark ? '11 14 5' : '255 255 255');
}
