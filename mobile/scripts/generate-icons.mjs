// Renders every app icon and splash image from one drawing (the FitzyClub runner mark).
// Run from mobile/:  node scripts/generate-icons.mjs
// Uses the `sharp` already installed for the website (frontend/), so the app needs no extra
// image dependency. The PNGs are committed; builds never run this.
import { createRequire } from 'module';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '../../frontend/package.json'));
const sharp = require('sharp');
const out = join(here, '../assets');
mkdirSync(join(out, 'brand'), { recursive: true });

const BG = '#0B0E13';
const LIME = '#D9FF4A';
const GREEN = '#3FDB80';

// The FitzyClub mark: a runner leaping out of a sweep, with a spark. Drawn on a 120 box (the same drawing as
// frontend/src/components/Logo.jsx), centred on the 1024 canvas and scaled by `scale` (1 = a 600 px mark).
const mark = (paint) => `
  <path d="M70 9 C 34 10 8 38 10 70 C 12 96 38 112 72 104 C 90 100 102 92 108 84 C 92 94 70 98 50 90 C 28 80 22 56 34 36 C 44 22 56 14 70 9 Z" fill="${paint}"/>
  <g fill="none" stroke="${paint}" stroke-linecap="round" stroke-linejoin="round">
    <path d="M74 42 C 70 52 66 60 60 70" stroke-width="9"/>
    <path d="M73 44 C 80 40 88 36 96 28" stroke-width="7"/>
    <path d="M71 48 C 64 50 58 52 52 58" stroke-width="7"/>
    <path d="M60 70 C 68 74 76 78 80 86 C 82 92 80 98 78 102" stroke-width="8"/>
    <path d="M60 70 C 52 74 46 80 40 86" stroke-width="8"/>
  </g>
  <circle cx="82" cy="27" r="9" fill="${paint}"/>
  <circle cx="101" cy="17" r="4.5" fill="${paint}"/>`;

const centred = (inner, scale = 1) => `<g transform="translate(512 512) scale(${5 * scale}) translate(-58.5 -60.5)">${inner}</g>`;

const gradient = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${LIME}"/><stop offset="1" stop-color="${GREEN}"/></linearGradient></defs>`;
const svg = (body, { bg } = {}) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  ${gradient}${bg ? `<rect width="1024" height="1024" fill="${bg}"/>` : ''}${body}</svg>`;

// `opaque` drops the alpha channel entirely: the App Store rejects icons that have one, even
// when every pixel is fully solid.
const png = (name, source, size = 1024, opaque = false) => {
  let img = sharp(Buffer.from(source), { density: 192 }).resize(size, size);
  if (opaque) img = img.flatten({ background: BG }).removeAlpha();
  return img.png().toFile(join(out, name));
};

const full = svg(centred(mark('url(#g)'), 1.2), { bg: BG });
// iOS icon: opaque, square, no transparency (the OS rounds the corners).
await png('icon.png', full, 1024, true);
// Android adaptive icon: foreground and background are separate layers.
await png('android-icon-foreground.png', svg(centred(mark('url(#g)'))));
await png('android-icon-background.png', svg('', { bg: BG }), 1024, true);
// Android 13 themed icon: a single flat shape; the system picks the colour.
await png('android-icon-monochrome.png', svg(centred(mark('#FFFFFF'))));
// Splash: the mark alone on transparent; the screen's background colour is set in app.json.
await png('splash-icon.png', svg(centred(mark('url(#g)'), 1.1)));
await png('favicon.png', full, 48, true);
writeFileSync(join(out, 'brand', 'fitzyclub-mark.svg'), svg(centred(mark('url(#g)'), 1.2), { bg: BG }));
console.log('icons written to', out);
