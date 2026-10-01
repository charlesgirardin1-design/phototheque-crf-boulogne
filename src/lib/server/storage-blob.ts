import "server-only";
import { del, get, getDownloadUrl, head, issueSignedToken, presignUrl, type IssuedSignedToken } from "@vercel/blob";

/**
 * Moteur Vercel Blob (store PRIVÉ). Authentification automatique sur Vercel
 * (OIDC + BLOB_STORE_ID), ou BLOB_READ_WRITE_TOKEN en local.
 * Les lectures se font par URL présignées à durée limitée, générées après contrôle du rôle.
 */

const READ_DELEGATION_MS = 2 * 60 * 60 * 1000;

declare global {
  var __crfBlobRead: IssuedSignedToken | undefined;
}

/** Délégation de lecture réutilisée tant qu'il lui reste plus d'une heure de validité. */
async function readDelegation(): Promise<IssuedSignedToken> {
  const cached = globalThis.__crfBlobRead;
  if (cached && cached.validUntil - Date.now() > 60 * 60 * 1000) return cached;
  const token = await issueSignedToken({
    pathname: "*",
    operations: ["get", "head"],
    validUntil: Date.now() + READ_DELEGATION_MS,
  });
  globalThis.__crfBlobRead = token;
  return token;
}

export async function presignGet(key: string, opts: { download?: boolean; expiresIn?: number } = {}) {
  const token = await readDelegation();
  const validUntil = Math.min(token.validUntil, Date.now() + (opts.expiresIn ?? 3600) * 1000);
  const { presignedUrl } = await presignUrl(token, { operation: "get", pathname: key, access: "private", validUntil });
  return opts.download ? getDownloadUrl(presignedUrl) : presignedUrl;
}

/** Délégation d'écriture limitée à UN chemin, un type et une taille (import direct navigateur → Blob). */
export async function uploadDelegation(key: string, contentType: string, maxBytes: number) {
  return issueSignedToken({
    pathname: key,
    operations: ["put"],
    allowedContentTypes: [contentType],
    maximumSizeInBytes: maxBytes,
    validUntil: Date.now() + 6 * 60 * 60 * 1000,
  });
}

export async function headObject(key: string) {
  try {
    const res = await head(key);
    return { size: res.size, contentType: res.contentType };
  } catch (err) {
    if ((err as Error).name === "BlobNotFoundError") return null;
    throw err;
  }
}

export async function readHead(key: string, bytes = 64): Promise<Uint8Array> {
  const res = await get(key, { access: "private", useCache: false, headers: { Range: `bytes=0-${bytes - 1}` } });
  if (!res || res.statusCode !== 200) return new Uint8Array();
  const reader = res.stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < bytes) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    total += value.length;
  }
  await reader.cancel().catch(() => {});
  const out = new Uint8Array(Math.min(total, bytes));
  let offset = 0;
  for (const c of chunks) {
    const part = c.subarray(0, out.length - offset);
    out.set(part, offset);
    offset += part.length;
    if (offset >= out.length) break;
  }
  return out;
}

export async function deleteObjects(keys: string[]) {
  const unique = [...new Set(keys.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 500) {
    await del(unique.slice(i, i + 500));
  }
}

/** Ouvre un objet en lecture (flux + métadonnées), ou null s'il n'existe pas. */
export async function openRead(key: string) {
  const res = await get(key, { access: "private", useCache: false });
  if (!res || res.statusCode !== 200) return null;
  return { stream: res.stream, size: res.blob.size, contentType: res.blob.contentType };
}
