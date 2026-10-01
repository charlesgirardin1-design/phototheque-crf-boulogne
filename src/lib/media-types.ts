/**
 * Formats acceptés. Le type MIME est déduit de l'extension car certains navigateurs
 * (Chrome/Windows pour le HEIC, par exemple) ne fournissent pas de type MIME.
 * Les fichiers sont stockés tels quels : aucune conversion n'est faite.
 */
export type MediaKind = "photo" | "video";

export const FORMATS: Record<string, { mime: string; kind: MediaKind }> = {
  jpg: { mime: "image/jpeg", kind: "photo" },
  jpeg: { mime: "image/jpeg", kind: "photo" },
  png: { mime: "image/png", kind: "photo" },
  heic: { mime: "image/heic", kind: "photo" },
  heif: { mime: "image/heif", kind: "photo" },
  webp: { mime: "image/webp", kind: "photo" },
  gif: { mime: "image/gif", kind: "photo" },
  avif: { mime: "image/avif", kind: "photo" },
  tif: { mime: "image/tiff", kind: "photo" },
  tiff: { mime: "image/tiff", kind: "photo" },
  mp4: { mime: "video/mp4", kind: "video" },
  m4v: { mime: "video/x-m4v", kind: "video" },
  mov: { mime: "video/quicktime", kind: "video" },
  webm: { mime: "video/webm", kind: "video" },
  mkv: { mime: "video/x-matroska", kind: "video" },
  avi: { mime: "video/x-msvideo", kind: "video" },
  "3gp": { mime: "video/3gpp", kind: "video" },
};

export const ACCEPT_ATTRIBUTE = [
  "image/*",
  "video/*",
  ...Object.keys(FORMATS).map((ext) => `.${ext}`),
].join(",");

export function extensionOf(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx >= 0 ? filename.slice(idx + 1).toLowerCase() : "";
}

export function formatFor(filename: string) {
  const ext = extensionOf(filename);
  const fmt = FORMATS[ext];
  return fmt ? { ext, ...fmt } : null;
}

/** Formats d'image affichables directement par les navigateurs courants. */
export function isBrowserDisplayableImage(mime: string) {
  return ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"].includes(mime);
}

export const STATUS_LABELS = { A_TRIER: "À TRIER", TRIEE: "TRIÉE" } as const;
export type MediaStatus = keyof typeof STATUS_LABELS;

export function formatBytes(n: number) {
  if (n < 1024) return `${n} o`;
  const units = ["Ko", "Mo", "Go", "To"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}
