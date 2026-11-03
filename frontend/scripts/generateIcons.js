// One-off generator for the website icon set: favicon, PWA icons and the Apple touch icon.
// Run with `npm run icons`; the output is committed so the normal build stays image-free.
// The drawing is the same F-with-a-dumbbell-crossbar as the mobile app
// (mobile/scripts/generate-icons.mjs) — keep the two in step.
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, '../public');
const iconsDir = join(pub, 'icons');
mkdirSync(iconsDir, { recursive: true });

const BG = '#0A0C10';
const LIME = '#C8F83A';
const GREEN = '#37D67A';

// Drawn on a 1024 canvas. The F is a stem and top arm; the middle arm is a dumbbell whose
// plates run through the stem and out past it on both sides.
const mark = (fill, outline) => `
  <g fill="${fill}">
    <rect x="330" y="248" width="116" height="528" rx="30"/>
    <rect x="330" y="248" width="372" height="112" rx="30"/>
  </g>
  <g fill="${fill}"${outline ? ` stroke="${outline}" stroke-width="12" paint-order="stroke"` : ''}>
    <rect x="270" y="476" width="400" height="72" rx="20"/>
    <rect x="222" y="418" width="46" height="188" rx="16"/>
    <rect x="276" y="446" width="36" height="132" rx="13"/>
    <rect x="670" y="418" width="46" height="188" rx="16"/>
    <rect x="628" y="446" width="36" height="132" rx="13"/>
  </g>`;

// Bounding box of the drawing is 222..716 by 248..776; centre it, then scale about the middle.
const centred = (inner, scale = 1) =>
  `<g transform="translate(512 512) scale(${scale}) translate(${-(222 + 716) / 2} ${-(248 + 776) / 2})">${inner}</g>`;

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
const tile = svg(centred(mark('url(#g)', BG), 1.2), { bg: BG, radius: 224 });
// Maskable: the launcher crops to its own shape, so a full-bleed square with the mark
// inside the central 60% safe zone.
const maskable = svg(centred(mark('url(#g)', BG), 0.9), { bg: BG });
// Apple draws its own rounded corners and rejects transparency: full-bleed and opaque.
const apple = svg(centred(mark('url(#g)', BG), 1.2), { bg: BG });

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
