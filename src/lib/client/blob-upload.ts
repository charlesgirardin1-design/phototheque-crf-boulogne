"use client";

import { uploadPresigned } from "@vercel/blob/client";

const MULTIPART_THRESHOLD = 50 * 1024 * 1024;

/**
 * Envoi direct navigateur → Vercel Blob (store privé). Le serveur n'autorise que le
 * chemin réservé pour ce média ; les gros fichiers sont envoyés en plusieurs parties.
 */
export async function sendToBlob(
  id: string,
  kind: "original" | "thumbnail" | "preview",
  pathname: string,
  body: Blob,
  contentType: string,
  signal?: AbortSignal,
  onProgress?: (loaded: number) => void,
) {
  await uploadPresigned(pathname, body, {
    access: "private",
    handleUploadUrl: "/api/uploads/blob",
    clientPayload: JSON.stringify({ id, kind }),
    contentType,
    multipart: body.size > MULTIPART_THRESHOLD,
    abortSignal: signal,
    onUploadProgress: onProgress ? (e) => onProgress(e.loaded) : undefined,
  });
}
