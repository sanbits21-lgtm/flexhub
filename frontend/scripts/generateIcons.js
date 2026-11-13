// One-off generator for the website icon set: favicon, PWA icons and the Apple touch icon.
// Run with `npm run icons`; the output is committed so the normal build stays image-free.
// The drawing is the FitzyClub runner mark, the same as the mobile app
// (mobile/scripts/generate-icons.mjs) and the Logo component: keep the three in step.
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, '../public');
const iconsDir = join(pub, 'icons');
mkdirSync(iconsDir, { recursive: true });

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
const svg = (body, { bg, radius = 0 } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${gradient}${
    bg ? `<rect width="1024" height="1024" rx="${radius}" fill="${bg}"/>` : ''
  }${body}</svg>`;

const png = (source, size, file, opaque = false) => {
  let img = sharp(Buffer.from(source), { density: 192 }).resize(size, size);
  if (opaque) img = img.flatten({ background: BG }).removeAlpha();
  return img.png().toFile(join(iconsDir, file));
};

// Browser tabs and PWA "any" icons: rounded tile, mark large enough to read at 16px.
const tile = svg(centred(mark('url(#g)'), 1.2), { bg: BG, radius: 224 });
// Maskable: the launcher crops to its own shape, so a full-bleed square with the mark
// inside the central 60% safe zone.
const maskable = svg(centred(mark('url(#g)'), 0.9), { bg: BG });
// Apple draws its own rounded corners and rejects transparency: full-bleed and opaque.
const apple = svg(centred(mark('url(#g)'), 1.2), { bg: BG });

writeFileSync(join(iconsDir, 'icon.svg'), tile);
writeFileSync(join(pub, 'favicon.svg'), tile);

await Promise.all([
  png(tile, 192, 'icon-192.png'),
  png(tile, 512, 'icon-512.png'),
  png(maskable, 512, 'icon-maskable-512.png', true),
  png(apple, 180, 'apple-touch-icon.png', true),
  sharp(Buffer.from(tile), { density: 192 }).resize(32, 32).png().toFile(join(pub, 'favicon-32.png')),
]);

console.log('Generated website icons in public/');
