/**
 * Lit la date de création d'une vidéo MP4/MOV (boîte moov/mvhd, ISO BMFF)
 * sans charger le fichier entier : seules quelques dizaines d'octets sont lues.
 */
export type RangeReader = (offset: number, length: number) => Promise<Uint8Array>;

const SECONDS_1904_TO_1970 = 2082844800;

function u32(b: Uint8Array, o: number) {
  return ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
}

function u64(b: Uint8Array, o: number) {
  return u32(b, o) * 2 ** 32 + u32(b, o + 4);
}

function type(b: Uint8Array, o: number) {
  return String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
}

async function readBoxHeader(read: RangeReader, offset: number, end: number) {
  if (offset + 8 > end) return null;
  const h = await read(offset, 16);
  if (h.length < 8) return null;
  let size = u32(h, 0);
  let headerSize = 8;
  if (size === 1) {
    if (h.length < 16) return null;
    size = u64(h, 8);
    headerSize = 16;
  } else if (size === 0) {
    size = end - offset;
  }
  if (size < headerSize) return null;
  return { type: type(h, 4), size, headerSize };
}

export async function readVideoCreationDate(read: RangeReader, fileSize: number): Promise<Date | null> {
  let offset = 0;
  for (let i = 0; i < 200 && offset < fileSize; i++) {
    const box = await readBoxHeader(read, offset, fileSize);
    if (!box) return null;
    if (box.type === "moov") {
      const moovEnd = offset + box.size;
      let child = offset + box.headerSize;
      for (let j = 0; j < 200 && child < moovEnd; j++) {
        const c = await readBoxHeader(read, child, moovEnd);
        if (!c) return null;
        if (c.type === "mvhd") {
          const body = await read(child + c.headerSize, 12);
          const version = body[0];
          const secs = version === 1 ? u64(body, 4) : u32(body, 4);
          const unix = secs - SECONDS_1904_TO_1970;
          // 0 ou valeurs aberrantes : date non renseignée par l'appareil.
          if (unix < 31536000 || unix * 1000 > Date.now() + 86_400_000) return null;
          return new Date(unix * 1000);
        }
        child += c.size;
      }
      return null;
    }
    offset += box.size;
  }
  return null;
}
