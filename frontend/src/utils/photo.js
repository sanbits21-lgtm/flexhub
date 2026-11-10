// Profile pictures. The server enforces the same rules (backend/utils/photos.js); checking here
// first just spares a round trip and gives the answer before anything is sent.
export const MIN_PHOTO_PIXELS = 200;
const OUTPUT_SIZE = 512;

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
