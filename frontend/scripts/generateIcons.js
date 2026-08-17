// One-off generator for the PWA icon set. Run with `npm run icons` after editing
// public/icons/icon.svg; the PNGs are committed so the normal build stays image-free.
//
// Maskable icons are cropped by Android to whatever shape the launcher uses, so that
// variant is rendered onto a padded canvas — the mark must survive a circular crop.
import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(here, '../public/icons');
const source = readFileSync(join(iconsDir, 'icon.svg'));

mkdirSync(iconsDir, { recursive: true });

const render = (size, file) =>
  sharp(source, { density: 384 }).resize(size, size).png().toFile(join(iconsDir, file));

// Safe-zone padding for maskable: the spec reserves the outer ~20%, so the mark is
// scaled to 60% and centred on the brand background.
const renderMaskable = async (size, file) => {
  const inner = Math.round(size * 0.6);
  const markOnly = await sharp(source, { density: 384 }).resize(inner, inner).png().toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: '#111827' },
  })
    .composite([{ input: markOnly, gravity: 'centre' }])
    .png()
    .toFile(join(iconsDir, file));
};

await Promise.all([
  render(192, 'icon-192.png'),
  render(512, 'icon-512.png'),
  render(180, 'apple-touch-icon.png'),
  renderMaskable(512, 'icon-maskable-512.png'),
]);

console.log('Generated PWA icons in public/icons/');
