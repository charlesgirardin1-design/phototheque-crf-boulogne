import "server-only";
import * as blob from "./storage-blob";
import * as s3 from "./storage-s3";

/**
 * Stockage des fichiers : Vercel Blob (privé) si le projet y est relié, sinon un bucket
 * compatible S3 (R2, AWS…). Dans les deux cas, les fichiers sont privés et ne sont
 * accessibles que par des URL signées temporaires, générées après contrôle du rôle.
 */
export type StorageDriver = "blob" | "s3";

export function storageDriver(): StorageDriver {
  return process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "s3";
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
