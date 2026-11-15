// Profile pictures. The server enforces the same rules (backend/utils/photos.js); checking here
// first just spares a round trip and gives the answer before anything is sent.
export const MIN_PHOTO_PIXELS = 200;
const OUTPUT_SIZE = 512;

const RECEIPT_MAX = 1600;

/**
 * A photographed bill: kept whole (no crop), shrunk to fit 1600 px on the long side, as JPEG (a phone photo is several
 * MB, the server takes 1 MB). Resolves to base64 JPEG without the data: prefix.
 */
export const receiptJpegBase64 = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    if (Math.min(img.width, img.height) < MIN_PHOTO_PIXELS) {
      reject(new Error(`That picture is too small (${img.width}x${img.height}). Take a clearer photo.`));
      return;
    }
    const scale = Math.min(1, RECEIPT_MAX / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    resolve(canvas.toDataURL('image/jpeg', 0.7).split(',')[1]);
  };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image. Use a JPEG, PNG or WebP picture.')); };
  img.src = url;
});

export const MIN_LOGO_PIXELS = 64;
const LOGO_MAX = 512;

/**
 * A logo, kept as it is (no square crop) and shrunk to fit 512 px. PNG so a transparent background stays transparent.
 * Resolves to base64 PNG without the data: prefix.
 */
export const logoPngBase64 = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    if (Math.min(img.width, img.height) < MIN_LOGO_PIXELS) {
      reject(new Error(`That logo is too small (${img.width}x${img.height}). Use one at least ${MIN_LOGO_PIXELS}x${MIN_LOGO_PIXELS} pixels.`));
      return;
    }
    const scale = Math.min(1, LOGO_MAX / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    resolve(canvas.toDataURL('image/png').split(',')[1]);
  };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image. Use a PNG, JPEG or WebP picture.')); };
  img.src = url;
});

/**
 * Reads a chosen picture, refuses one smaller than 200x200 pixels, then centre-crops it to a square
 * and shrinks it to 512 px (the server takes 1 MB at most). Resolves to base64 JPEG, with no
 * data: prefix. The size is checked on the ORIGINAL, before shrinking, because enlarging a tiny
 * picture would only hide that it is tiny.
 */
export const squareJpegBase64 = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    const side = Math.min(img.width, img.height);
    if (side < MIN_PHOTO_PIXELS) {
      reject(new Error(`That picture is too small (${img.width}x${img.height}). Use one at least ${MIN_PHOTO_PIXELS}x${MIN_PHOTO_PIXELS} pixels.`));
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    canvas.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    resolve(canvas.toDataURL('image/jpeg', 0.7).split(',')[1]);
  };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image. Use a JPEG, PNG or WebP picture.')); };
  img.src = url;
});
