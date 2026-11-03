// Renders every app icon and splash image from one drawing (the F with a dumbbell crossbar).
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

const BG = '#0A0C10';
const LIME = '#C8F83A';
const GREEN = '#37D67A';

// The mark is drawn on a 1024 canvas, centred, and fits inside the middle 66% (the area
// Android guarantees is never cropped by a launcher's mask).
// F: a stem and top arm. The middle arm is a dumbbell: a handle with a pair of weight
// plates at each end, running through the stem and past it on both sides.
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

// Centres the drawing (bounding box 222..716 by 248..776) on the canvas, optionally enlarged.
const centred = (inner, scale = 1) => `<g transform="translate(512 512) scale(${scale}) translate(${-(222 + 716) / 2} ${-(248 + 776) / 2})">${inner}</g>`;

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

const full = svg(centred(mark('url(#g)', BG), 1.2), { bg: BG });
// iOS icon: opaque, square, no transparency (the OS rounds the corners).
await png('icon.png', full, 1024, true);
// Android adaptive icon: foreground and background are separate layers.
await png('android-icon-foreground.png', svg(centred(mark('url(#g)', BG))));
await png('android-icon-background.png', svg('', { bg: BG }), 1024, true);
// Android 13 themed icon: a single flat shape; the system picks the colour.
await png('android-icon-monochrome.png', svg(centred(mark('#FFFFFF'))));
// Splash: the mark alone on transparent; the screen's background colour is set in app.json.
await png('splash-icon.png', svg(centred(mark('url(#g)', BG), 1.1)));
await png('favicon.png', full, 48, true);
writeFileSync(join(out, 'brand', 'flexhub-mark.svg'), svg(centred(mark('url(#g)', BG), 1.2), { bg: BG }));
console.log('icons written to', out);
