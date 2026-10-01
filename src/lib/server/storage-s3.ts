import "server-only";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
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

/** URL de lecture temporaire. `downloadName` force le téléchargement sous le nom d'origine. */
export async function presignGet(
  key: string,
  opts: { downloadName?: string; inlineName?: string; expiresIn?: number } = {},
) {
  const cmd = new GetObjectCommand({
    Bucket: bucket(),
    Key: key,
    ResponseContentDisposition: opts.downloadName
      ? contentDisposition("attachment", opts.downloadName)
      : opts.inlineName
        ? contentDisposition("inline", opts.inlineName)
        : undefined,
  });
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

/** Supprime définitivement des objets. Lève une erreur si un objet n'a pas pu être supprimé. */
export async function deleteObjects(keys: string[]) {
  const unique = [...new Set(keys.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 1000) {
    const chunk = unique.slice(i, i + 1000);
    const res = await client().send(
      new DeleteObjectsCommand({
        Bucket: bucket(),
        Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
      }),
    );
    const errors = (res.Errors ?? []).filter((e) => e.Code !== "NoSuchKey");
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
