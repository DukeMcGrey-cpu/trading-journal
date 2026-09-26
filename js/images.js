// Client-side handling for trade screenshots: compress in the browser, upload through Apps Script.
// Compressing before upload keeps the Sheet's ImgBB usage small and uploads fast on mobile data.

const MAX_DIM = 1600;
const QUALITY = 0.82;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024; // reject absurd originals before decoding

export class ImageTooLargeError extends Error {}

/**
 * Reads a picked file, downsizes it to at most 1600px on the long edge, and re-encodes it as JPEG.
 * Returns { base64, previewUrl, name }: base64 is what gets sent to ImgBB, previewUrl is a data URL
 * for showing the image immediately, before the upload has even started.
 */
export async function prepareImage(file) {
  if (!file.type || !file.type.startsWith('image/')) throw new Error('That file is not an image.');
  if (file.size > MAX_SOURCE_BYTES) throw new ImageTooLargeError('That image is larger than 8 MB. Try a smaller screenshot.');

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();

  const dataUrl = canvas.toDataURL('image/jpeg', QUALITY);
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const name = (file.name || 'trade').replace(/[^\w.\-]/g, '_').replace(/\.\w+$/, '') + '.jpg';
  return { base64, previewUrl: dataUrl, name };
}

/** Safely reads the JSON list of ImgBB delete URLs a trade carries in its imgDeleteUrls column. */
export function parseDeleteUrls(v) {
  try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
}
