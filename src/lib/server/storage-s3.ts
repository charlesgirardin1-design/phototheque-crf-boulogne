import "server-only";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "node:stream";
import type { ReadableStream as NodeWebStream } from "node:stream/web";
import { env } from "./env";

/**
 * Moteur S3 : stockage objet compatible S3 (Cloudflare R2, AWS S3, Supabase Storage S3, MinIO…).
 * Le bucket est PRIVÉ : tous les accès passent par des URL signées à durée limitée,
 * générées uniquement après vérification du rôle côté serveur.
 */

declare global {
  var __crfS3: S3Client | undefined;
}

function client(): S3Client {
  if (!globalThis.__crfS3) {
    const cfg = env.s3;
    globalThis.__crfS3 = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      forcePathStyle: cfg.forcePathStyle,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
      // Sans cela, le SDK ajoute une somme de contrôle CRC32 aux URL signées,
      // que le navigateur ne peut pas fournir (PUT refusé par R2/S3).
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return globalThis.__crfS3;
}

const bucket = () => env.s3.bucket;

/** URL de dépôt direct navigateur → stockage. Type et taille sont signés. */
export async function presignUpload(key: string, contentType: string, size: number) {
  const cmd = new PutObjectCommand({
    Bucket: bucket(),
    Key: key,
    ContentType: contentType,
    ContentLength: size,
  });
  return getSignedUrl(client(), cmd, {
    expiresIn: 60 * 60 * 6, // gros fichiers vidéo sur connexion lente
    signableHeaders: new Set(["content-type", "content-length"]),
  });
}

function contentDisposition(kind: "inline" | "attachment", filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

// Les URL d'affichage sont signées sur une fenêtre de 6 h et valables 12 h : pendant 6 h,
// une même image a donc toujours la même URL, que le navigateur peut garder en cache.
const CACHE_WINDOW_MS = 6 * 60 * 60 * 1000;
const CACHE_EXPIRES_S = 12 * 60 * 60;

/**
 * URL de lecture temporaire. `downloadName` force le téléchargement sous le nom d'origine.
 * `cacheable` : URL stable + en-tête de cache long (les clés de stockage ne changent jamais
 * de contenu), pour que miniatures et aperçus ne soient téléchargés qu'une fois.
 */
export async function presignGet(
  key: string,
  opts: { downloadName?: string; inlineName?: string; expiresIn?: number; cacheable?: boolean } = {},
) {
  const cmd = new GetObjectCommand({
    Bucket: bucket(),
    Key: key,
    ResponseContentDisposition: opts.downloadName
      ? contentDisposition("attachment", opts.downloadName)
      : opts.inlineName
        ? contentDisposition("inline", opts.inlineName)
        : undefined,
    ResponseCacheControl: opts.cacheable ? "private, max-age=43200, immutable" : undefined,
  });
  if (opts.cacheable) {
    const signingDate = new Date(Math.floor(Date.now() / CACHE_WINDOW_MS) * CACHE_WINDOW_MS);
    return getSignedUrl(client(), cmd, { expiresIn: CACHE_EXPIRES_S, signingDate });
  }
  return getSignedUrl(client(), cmd, { expiresIn: opts.expiresIn ?? 60 * 60 });
}

/** Taille et type de l'objet, ou null s'il n'existe pas. */
export async function headObject(key: string) {
  try {
    const res = await client().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return { size: Number(res.ContentLength ?? 0), contentType: res.ContentType ?? "" };
  } catch (err: unknown) {
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404 || status === 403) return null;
    throw err;
  }
}

/** Lit les premiers octets d'un objet (vérification de la signature du fichier). */
export async function readHead(key: string, bytes = 64): Promise<Uint8Array> {
  const res = await client().send(
    new GetObjectCommand({ Bucket: bucket(), Key: key, Range: `bytes=0-${bytes - 1}` }),
  );
  return res.Body ? await res.Body.transformToByteArray() : new Uint8Array();
}

type ObjectRef = { Key: string; VersionId?: string };

/**
 * Toutes les versions d'un objet. Backblaze B2 (et tout bucket versionné) conserve les
 * versions précédentes : une suppression simple ne fait que CACHER le fichier, qui reste
 * stocké (et facturé). Pour une suppression réellement définitive, chaque version est supprimée.
 */
async function versionsOf(key: string): Promise<ObjectRef[] | null> {
  try {
    const refs: ObjectRef[] = [];
    let KeyMarker: string | undefined;
    let VersionIdMarker: string | undefined;
    do {
      const res = await client().send(
        new ListObjectVersionsCommand({ Bucket: bucket(), Prefix: key, KeyMarker, VersionIdMarker }),
      );
      for (const v of [...(res.Versions ?? []), ...(res.DeleteMarkers ?? [])]) {
        if (v.Key === key) refs.push({ Key: key, VersionId: v.VersionId ?? undefined });
      }
      KeyMarker = res.IsTruncated ? res.NextKeyMarker : undefined;
      VersionIdMarker = res.IsTruncated ? res.NextVersionIdMarker : undefined;
    } while (KeyMarker);
    return refs;
  } catch {
    return null; // fournisseur sans versions : suppression simple
  }
}

/** Supprime définitivement des objets (toutes versions). Lève une erreur si un objet n'a pas pu être supprimé. */
export async function deleteObjects(keys: string[]) {
  const unique = [...new Set(keys.filter(Boolean))];
  const refs: ObjectRef[] = [];
  for (let i = 0; i < unique.length; i += 8) {
    const lists = await Promise.all(unique.slice(i, i + 8).map(versionsOf));
    lists.forEach((list, j) => {
      const key = unique[i + j];
      if (list === null) refs.push({ Key: key });
      else refs.push(...list); // liste vide : objet déjà absent
    });
  }
  for (let i = 0; i < refs.length; i += 1000) {
    const chunk = refs.slice(i, i + 1000);
    const res = await client().send(
      new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: chunk, Quiet: true } }),
    );
    const errors = (res.Errors ?? []).filter((e) => e.Code !== "NoSuchKey" && e.Code !== "NoSuchVersion");
    if (errors.length > 0) {
      throw new Error(`Suppression impossible de ${errors.length} fichier(s) dans le stockage`);
    }
  }
}

/** Écrit un objet depuis un flux (migration d'un autre stockage). La taille doit être connue. */
export async function putObjectStream(
  key: string,
  body: ReadableStream<Uint8Array>,
  contentType: string,
  size: number,
) {
  await client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: Readable.fromWeb(body as unknown as NodeWebStream<Uint8Array>),
      ContentType: contentType,
      ContentLength: size,
    }),
  );
}
