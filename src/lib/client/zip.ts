"use client";

import { downloadZip } from "client-zip";
import { api } from "./api";

type FileUrl = { id: string; filename: string; size: number; url: string };

function uniqueNames(files: FileUrl[]) {
  const seen = new Map<string, number>();
  return files.map((f) => {
    const n = seen.get(f.filename) ?? 0;
    seen.set(f.filename, n + 1);
    if (n === 0) return f.filename;
    const dot = f.filename.lastIndexOf(".");
    return dot > 0
      ? `${f.filename.slice(0, dot)} (${n + 1})${f.filename.slice(dot)}`
      : `${f.filename} (${n + 1})`;
  });
}

/**
 * Téléchargement multiple en ZIP, assemblé DANS LE NAVIGATEUR :
 * les originaux sont lus directement depuis le stockage et ajoutés sans compression
 * ni modification. Sur Chrome/Edge, l'archive est écrite en flux sur le disque
 * (aucune limite de taille) ; ailleurs, elle est construite en mémoire.
 */
export async function downloadAsZip(ids: string[], onProgress?: (done: number, total: number) => void) {
  const zipName = `phototheque-${new Date().toISOString().slice(0, 10)}.zip`;

  // Le sélecteur doit être ouvert tout de suite après le clic (activation utilisateur).
  const picker = (window as unknown as {
    showSaveFilePicker?: (o: unknown) => Promise<{ createWritable: () => Promise<WritableStream> }>;
  }).showSaveFilePicker;
  let writable: WritableStream | null = null;
  if (picker) {
    try {
      const handle = await picker({
        suggestedName: zipName,
        types: [{ description: "Archive ZIP", accept: { "application/zip": [".zip"] } }],
      });
      writable = await handle.createWritable();
    } catch (err) {
      if ((err as DOMException).name === "AbortError") return { count: 0, cancelled: true };
      writable = null; // sélecteur indisponible : repli en mémoire
    }
  }

  const { files } = await api<{ files: FileUrl[] }>("/api/media/download-urls", {
    method: "POST",
    json: { ids },
  });
  if (files.length === 0) {
    await writable?.abort();
    throw new Error("Aucun fichier à télécharger");
  }
  const names = uniqueNames(files);

  let done = 0;
  async function* entries() {
    for (let i = 0; i < files.length; i++) {
      const res = await fetch(files[i].url);
      if (!res.ok) throw new Error(`Impossible de récupérer ${files[i].filename}`);
      yield { name: names[i], input: res, size: files[i].size };
      onProgress?.(++done, files.length);
    }
  }
  const zip = downloadZip(entries());

  if (writable && zip.body) {
    await zip.body.pipeTo(writable);
    return { count: files.length, cancelled: false };
  }

  const blob = await zip.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = zipName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  return { count: files.length, cancelled: false };
}
