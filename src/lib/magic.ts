/**
 * Vérifie que les premiers octets d'un fichier correspondent à son extension,
 * afin de refuser un fichier déguisé (ex. un .exe renommé en .jpg).
 */
function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function startsWith(bytes: Uint8Array, sig: number[], offset = 0) {
  return sig.every((b, i) => bytes[offset + i] === b);
}

const ISO_BMFF_BOXES = ["ftyp", "moov", "mdat", "wide", "free", "skip", "pnot"];

export function matchesSignature(ext: string, bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  switch (ext) {
    case "jpg":
    case "jpeg":
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case "png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "gif":
      return ascii(bytes, 0, 4) === "GIF8";
    case "webp":
      return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP";
    case "tif":
    case "tiff":
      return startsWith(bytes, [0x49, 0x49, 0x2a, 0x00]) || startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a]);
    case "heic":
    case "heif":
    case "avif":
      return ascii(bytes, 4, 4) === "ftyp";
    case "mp4":
    case "m4v":
    case "mov":
    case "3gp":
      return ISO_BMFF_BOXES.includes(ascii(bytes, 4, 4));
    case "webm":
    case "mkv":
      return startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
    case "avi":
      return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "AVI ";
    default:
      return false;
  }
}

export function isJpeg(bytes: Uint8Array) {
  return bytes.length >= 3 && startsWith(bytes, [0xff, 0xd8, 0xff]);
}
