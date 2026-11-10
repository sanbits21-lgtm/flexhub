const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Profile pictures for members and staff share one set of rules, so a rule changed here changes
// everywhere. The type comes from the bytes (never the claimed mime type or file name): the file
// is stored and served back, so it must really be an image.
const MAX_PHOTO_BYTES = 1024 * 1024;
// The shorter side, in pixels. Smaller than this is a thumbnail that turns to mush in a 96 px avatar.
const MIN_PHOTO_PIXELS = 200;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const sniffImage = (buf) => {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (buf.length > 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE)) return { ext: 'png', mime: 'image/png' };
  if (buf.length > 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  return null;
};

// Width and height read from the file's own header, without decoding the picture.
const jpegSize = (buf) => {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i += 1; continue; }
    const marker = buf[i + 1];
    if (marker === 0xff) { i += 1; continue; }
    // Start-of-frame markers carry the size (not DHT 0xc4, JPG 0xc8, DAC 0xcc).
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
};

const pngSize = (buf) => (buf.length >= 24 ? { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) } : null);

const webpSize = (buf) => {
  const kind = buf.subarray(12, 16).toString();
  if (kind === 'VP8X' && buf.length >= 30) return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  if (kind === 'VP8L' && buf.length >= 25) {
    const bits = buf.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  if (kind === 'VP8 ' && buf.length >= 30) return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  return null;
};

const imageSize = (buf, type) => {
  try {
    if (type.ext === 'jpg') return jpegSize(buf);
    if (type.ext === 'png') return pngSize(buf);
    return webpSize(buf);
  } catch { return null; }
};

/**
 * Checks a base64 upload. Returns { buf, type } to store, or { status, message } to send back.
 * A picture whose size cannot be read is refused: the rule cannot be checked, and a
 * hand-built file with a hidden header is exactly what the check is for.
 */
const checkPhoto = (image) => {
  const raw = typeof image === 'string' ? image.replace(/^data:[^;]+;base64,/, '') : '';
  if (!raw || !/^[A-Za-z0-9+/=\s]+$/.test(raw)) return { status: 400, message: 'Send the photo as base64 in "image".' };
  const buf = Buffer.from(raw, 'base64');
  if (buf.length > MAX_PHOTO_BYTES) return { status: 413, message: 'Photo is too large. Maximum is 1 MB.' };
  const type = sniffImage(buf);
  if (!type) return { status: 400, message: 'Photo must be a JPEG, PNG or WebP image.' };
  const size = imageSize(buf, type);
  if (!size || !size.width || !size.height) return { status: 400, message: 'Could not read the size of that picture. Try a different one.' };
  if (Math.min(size.width, size.height) < MIN_PHOTO_PIXELS) {
    return { status: 400, message: `Photo is too small (${size.width}x${size.height}). Use a picture at least ${MIN_PHOTO_PIXELS}x${MIN_PHOTO_PIXELS} pixels.` };
  }
  return { buf, type };
};

const photoDir = (folder) => path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '../uploads'), folder);

// A random name so a file cannot be guessed from the id, and a new upload never serves a stale
// cached copy under the old name. Returns the stored file name.
const storePhoto = async (folder, ownerId, buf, type) => {
  const dir = photoDir(folder);
  await fs.promises.mkdir(dir, { recursive: true });
  const file = `${ownerId}-${crypto.randomBytes(8).toString('hex')}.${type.ext}`;
  await fs.promises.writeFile(path.join(dir, file), buf);
  return file;
};

const removePhotoFile = (folder, file) => (file ? fs.promises.unlink(path.join(photoDir(folder), path.basename(file))).catch(() => {}) : Promise.resolve());

// Streams a stored photo, re-checking that it really is an image before serving it.
const sendPhoto = async (res, folder, file) => {
  const full = path.join(photoDir(folder), path.basename(file));
  const type = sniffImage(await fs.promises.readFile(full).catch(() => Buffer.alloc(0)));
  if (!type) return res.status(404).json({ message: 'No photo' });
  res.setHeader('Content-Type', type.mime);
  res.setHeader('Cache-Control', 'private, max-age=300');
  return fs.createReadStream(full).pipe(res);
};

module.exports = { MAX_PHOTO_BYTES, MIN_PHOTO_PIXELS, sniffImage, imageSize, checkPhoto, storePhoto, removePhotoFile, sendPhoto };
