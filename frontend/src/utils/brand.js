// Turns a gym's brand colour into the three CSS variables the theme uses.
const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const luminance = ([r, g, b]) => {
  const f = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const mixWithWhite = (rgb, t) => rgb.map((v) => Math.round(v + (255 - v) * t));

export const DEFAULT_ACCENT = '#C8F83A';

const isHex = (v) => /^#[0-9a-fA-F]{6}$/.test(v || '');

/** Text colour (as an rgb triplet) for the accent: dark only when BOTH gradient ends are bright. */
export const inkFor = (hex, hex2) => {
  const lums = [hex, hex2].filter(isHex).map((h) => luminance(hexToRgb(h)));
  return lums.length && Math.min(...lums) > 0.4 ? '11 14 5' : '255 255 255';
};

/** The CSS the accent fill uses: a linear gradient when there is a second colour, else flat. */
export const accentGradientCss = (color, color2, angle = 135) => {
  const from = isHex(color) ? color : DEFAULT_ACCENT;
  return isHex(color2) ? `linear-gradient(${angle}deg, ${from}, ${color2})` : from;
};

/**
 * Sets (or, with no colour, resets) the accent. With a second colour, every accent-filled
 * surface becomes a linear gradient (see .bg-accent in index.css). Text on the accent is black
 * or white, judged on the average of the two colours so it stays readable across the gradient.
 */
export function applyAccent(hex, hex2, angle = 135) {
  const root = document.documentElement.style;
  const keys = ['--accent', '--accent-2', '--accent-hover', '--accent-ink', '--accent-angle'];
  if (!isHex(hex)) {
    keys.forEach((k) => root.removeProperty(k));
    return;
  }
  const rgb = hexToRgb(hex);
  const rgb2 = isHex(hex2) ? hexToRgb(hex2) : rgb;
  const mid = rgb.map((v, i) => Math.round((v + rgb2[i]) / 2));
  root.setProperty('--accent', rgb.join(' '));
  root.setProperty('--accent-2', rgb2.join(' '));
  root.setProperty('--accent-angle', `${angle}deg`);
  root.setProperty('--accent-hover', mixWithWhite(mid, 0.25).join(' '));
  root.setProperty('--accent-ink', inkFor(hex, hex2));
}
