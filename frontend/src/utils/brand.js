// Turns a gym's brand colour into the three CSS variables the theme uses.
const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const luminance = ([r, g, b]) => {
  const f = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const toHsl = ([r, g, b]) => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min; const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
};
const fromHsl = ([h, s, l]) => {
  const k = (n) => (n + h / 30) % 12; const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [0, 8, 4].map((n) => Math.round(f(n) * 255));
};
const contrastOnWhite = (rgb) => 1.05 / (luminance(rgb) + 0.05);

/** The colour darkened (same hue, same richness) until it reads on white at 4.5:1: for text, chart lines and focus rings in the light theme. */
export const strongAccent = (rgb) => {
  if (contrastOnWhite(rgb) >= 4.5) return rgb;
  const [h, s, l] = toHsl(rgb);
  for (let lightness = Math.min(l, 0.55); lightness > 0.05; lightness -= 0.005) {
    const out = fromHsl([h, s, lightness]);
    if (contrastOnWhite(out) >= 4.5) return out;
  }
  return [0, 0, 0];
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
  const keys = ['--accent', '--accent-strong', '--accent-2', '--accent-hover', '--accent-ink', '--accent-angle'];
  if (!isHex(hex)) {
    keys.forEach((k) => root.removeProperty(k));
    return;
  }
  const rgb = hexToRgb(hex);
  const rgb2 = isHex(hex2) ? hexToRgb(hex2) : rgb;
  const mid = rgb.map((v, i) => Math.round((v + rgb2[i]) / 2));
  root.setProperty('--accent', rgb.join(' '));
  root.setProperty('--accent-strong', strongAccent(mid).join(' '));
  root.setProperty('--accent-2', rgb2.join(' '));
  root.setProperty('--accent-angle', `${angle}deg`);
  root.setProperty('--accent-hover', mixWithWhite(mid, 0.25).join(' '));
  root.setProperty('--accent-ink', inkFor(hex, hex2));
}
