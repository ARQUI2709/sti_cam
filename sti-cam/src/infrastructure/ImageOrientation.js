/**
 * Infrastructure: ImageOrientation
 * Phone cameras store portrait photos as landscape pixels plus an EXIF
 * Orientation tag. Full-size viewers honor the tag, but Google's generated
 * thumbnails (Drive thumbnailLink, =IMAGE() in Sheets, Looker Studio) don't,
 * so those show the photo sideways.
 *
 * normalizeOrientation() bakes the rotation into the pixels and re-inserts the
 * original EXIF block (GPS, date, camera) with Orientation = 1. Any failure
 * returns the original blob untouched — a photo is never lost over this.
 */

import { logger } from './Logger';

const TAG_ORIENTATION = 0x0112;
const JPEG_QUALITY = 0.95;

/**
 * Walks the JPEG markers and returns the EXIF APP1 segment, the orientation
 * tag location and the raw (stored) pixel size from the SOF marker.
 */
function parseJpeg(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  const info = { exif: null, orientation: 1, orientationPos: -1, ifd1PtrPos: -1, little: false, width: 0, height: 0 };
  let pos = 2;

  while (pos + 4 <= bytes.length) {
    if (bytes[pos] !== 0xff) return info;
    const marker = bytes[pos + 1];
    if (marker === 0xd9 || marker === 0xda) break; // EOI / start of scan
    const len = (bytes[pos + 2] << 8) | bytes[pos + 3];
    const start = pos;
    const end = pos + 2 + len;

    if (marker === 0xe1 && !info.exif && isExifHeader(bytes, pos + 4)) {
      info.exif = { start, end };
      readOrientation(bytes, pos + 10, info);
    } else if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      info.height = (bytes[pos + 5] << 8) | bytes[pos + 6];
      info.width = (bytes[pos + 7] << 8) | bytes[pos + 8];
    }
    pos = end;
  }
  return info;
}

function isExifHeader(bytes, p) {
  // "Exif\0\0"
  return bytes[p] === 0x45 && bytes[p + 1] === 0x78 && bytes[p + 2] === 0x69
    && bytes[p + 3] === 0x66 && bytes[p + 4] === 0 && bytes[p + 5] === 0;
}

/** Reads IFD0 of the TIFF block starting at `tiff` (absolute offset). */
function readOrientation(bytes, tiff, info) {
  const little = bytes[tiff] === 0x49; // "II" = little endian, "MM" = big endian
  const u16 = (p) => (little ? bytes[p] | (bytes[p + 1] << 8) : (bytes[p] << 8) | bytes[p + 1]);
  const u32 = (p) => (little
    ? (bytes[p] | (bytes[p + 1] << 8) | (bytes[p + 2] << 16) | (bytes[p + 3] << 24)) >>> 0
    : ((bytes[p] << 24) | (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3]) >>> 0);

  info.little = little;
  const ifd0 = tiff + u32(tiff + 4);
  const count = u16(ifd0);
  for (let i = 0; i < count; i++) {
    const entry = ifd0 + 2 + i * 12;
    if (u16(entry) === TAG_ORIENTATION) {
      info.orientation = u16(entry + 8);
      info.orientationPos = entry + 8;
      break;
    }
  }
  // Pointer to IFD1 (the embedded EXIF thumbnail), right after IFD0's entries
  info.ifd1PtrPos = ifd0 + 2 + count * 12;
}

/**
 * Copies the original EXIF segment with Orientation = 1. The embedded EXIF
 * thumbnail is unlinked (IFD1 pointer = 0) because it's still stored sideways.
 */
function patchedExif(bytes, info) {
  const seg = bytes.slice(info.exif.start, info.exif.end);
  const write16 = (p, v) => {
    const rel = p - info.exif.start;
    if (info.little) { seg[rel] = v & 0xff; seg[rel + 1] = v >> 8; }
    else { seg[rel] = v >> 8; seg[rel + 1] = v & 0xff; }
  };
  write16(info.orientationPos, 1);
  write16(info.orientationPos + 2, 0);
  const ptr = info.ifd1PtrPos - info.exif.start;
  if (ptr + 4 <= seg.length) seg.fill(0, ptr, ptr + 4);
  return seg;
}

/** Returns the canvas JPEG without its SOI and JFIF APP0 segment. */
function jpegBody(bytes) {
  let pos = 2;
  if (bytes[pos] === 0xff && bytes[pos + 1] === 0xe0) {
    pos += 2 + ((bytes[pos + 2] << 8) | bytes[pos + 3]);
  }
  return bytes.subarray(pos);
}

function canvasToJpeg(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', JPEG_QUALITY);
  });
}

/**
 * @param {Blob} blob - photo as captured / picked from the gallery
 * @returns {Promise<Blob>} upright JPEG with Orientation = 1, or the original blob
 */
export async function normalizeOrientation(blob) {
  try {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const info = parseJpeg(bytes);
    if (!info || !info.exif || info.orientationPos < 0 || info.orientation <= 1 || info.orientation > 8) {
      return blob;
    }

    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    const w = bitmap.width;
    const h = bitmap.height;

    // Orientations 5–8 swap width/height. If the decoder didn't apply EXIF we'd
    // bake in the sideways image and lose the tag, so keep the original instead.
    const swaps = info.orientation >= 5;
    if (swaps && info.width && info.width !== info.height && w === info.width) {
      bitmap.close();
      logger.warn('[Orientation] El navegador no aplicó EXIF; se sube la foto original');
      return blob;
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    bitmap.close();

    const encoded = new Uint8Array(await (await canvasToJpeg(canvas)).arrayBuffer());
    canvas.width = canvas.height = 0; // release canvas memory (iOS)

    const out = new Blob(
      [new Uint8Array([0xff, 0xd8]), patchedExif(bytes, info), jpegBody(encoded)],
      { type: 'image/jpeg' },
    );
    logger.log(`[Orientation] Foto enderezada (EXIF ${info.orientation} → 1), ${w}x${h}`);
    return out;
  } catch (err) {
    logger.warn('[Orientation] No se pudo enderezar, se sube la original:', err);
    return blob;
  }
}
