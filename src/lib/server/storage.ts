import "server-only";
import * as blob from "./storage-blob";
import * as s3 from "./storage-s3";

/**
 * Stockage des fichiers : bucket compatible S3 (Backblaze B2, Cloudflare R2, AWS…) dès que
 * ses clés sont renseignées, sinon Vercel Blob (privé). STORAGE_DRIVER=blob|s3 force le choix.
 * Dans les deux cas, les fichiers sont privés et ne sont accessibles que par des URL
 * signées temporaires, générées après contrôle du rôle.
 */
export type StorageDriver = "blob" | "s3";

const has = (k: string) => Boolean(process.env[k]?.trim());

export function s3Configured() {
  return has("S3_BUCKET") && has("S3_ACCESS_KEY_ID") && has("S3_SECRET_ACCESS_KEY");
}

export function blobConfigured() {
  return has("BLOB_STORE_ID") || has("BLOB_READ_WRITE_TOKEN");
}

export function storageDriver(): StorageDriver {
  const forced = process.env.STORAGE_DRIVER;
  if (forced === "blob" || forced === "s3") return forced;
  return s3Configured() ? "s3" : "blob";
}

export async function presignGet(
  key: string,
  opts: { downloadName?: string; inlineName?: string; expiresIn?: number } = {},
) {
  if (storageDriver() === "blob") {
    // Le nom de téléchargement est celui du chemin, qui se termine par le nom d'origine.
    return blob.presignGet(key, { download: Boolean(opts.downloadName), expiresIn: opts.expiresIn });
  }
  return s3.presignGet(key, opts);
}

export function headObject(key: string) {
  return storageDriver() === "blob" ? blob.headObject(key) : s3.headObject(key);
}

export function readHead(key: string, bytes = 64) {
  return storageDriver() === "blob" ? blob.readHead(key, bytes) : s3.readHead(key, bytes);
}

export function deleteObjects(keys: string[]) {
  return storageDriver() === "blob" ? blob.deleteObjects(keys) : s3.deleteObjects(keys);
}

export const presignUpload = s3.presignUpload;
export const uploadDelegation = blob.uploadDelegation;
