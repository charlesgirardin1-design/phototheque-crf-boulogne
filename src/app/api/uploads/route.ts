import { randomUUID } from "node:crypto";
import { db } from "@/lib/server/db";
import { env } from "@/lib/server/env";
import { assertSameOrigin, badRequest, cleanText, handler, readJson, requireRole } from "@/lib/server/http";
import { assertValidClassification } from "@/lib/server/media";
import { presignUpload, storageDriver } from "@/lib/server/storage";
import { formatFor } from "@/lib/media-types";

const MAX_DERIVED_BYTES = 8 * 1024 * 1024;
const TAKEN_AT_SOURCES = ["exif", "video", "file", "manual", "none"];

type Body = {
  filename?: unknown;
  size?: unknown;
  photographer?: unknown;
  categoryId?: unknown;
  activityId?: unknown;
  takenAt?: unknown;
  takenAtSource?: unknown;
  thumbnailSize?: unknown;
  previewSize?: unknown;
};

function derivedSize(v: unknown) {
  if (v === undefined || v === null || v === 0) return null;
  if (!Number.isInteger(v) || (v as number) < 1 || (v as number) > MAX_DERIVED_BYTES) {
    throw badRequest("Miniature invalide");
  }
  return v as number;
}

/**
 * Étape 1 de l'import : valide les métadonnées, réserve l'enregistrement (état « pending »)
 * et renvoie des URL signées permettant au navigateur d'envoyer le fichier ORIGINAL
 * directement au stockage, sans transiter par une fonction Vercel (limite 4,5 Mo).
 */
export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  await requireRole("user");
  const body = await readJson<Body>(req);

  const filename = cleanText(body.filename, "Le nom du fichier", 255).replace(/[\\/]/g, "_");
  const format = formatFor(filename);
  if (!format) throw badRequest(`Format non pris en charge : ${filename}`);

  const size = body.size;
  if (!Number.isInteger(size) || (size as number) <= 0) throw badRequest("Taille de fichier invalide");
  if ((size as number) > env.maxUploadBytes) {
    throw badRequest(`Fichier trop volumineux (max. ${Math.round(env.maxUploadBytes / 1024 / 1024)} Mo)`);
  }

  const photographer = cleanText(body.photographer, "Le photographe", 120);
  const { categoryId, activityId } = await assertValidClassification(body.categoryId, body.activityId);

  let takenAt: Date | null = null;
  let takenAtSource = "none";
  if (typeof body.takenAt === "string" && body.takenAt) {
    const d = new Date(body.takenAt);
    if (isNaN(d.getTime()) || d.getUTCFullYear() < 1900 || d.getTime() > Date.now() + 86_400_000) {
      throw badRequest("Date de prise de vue invalide");
    }
    takenAt = d;
    takenAtSource =
      typeof body.takenAtSource === "string" && TAKEN_AT_SOURCES.includes(body.takenAtSource)
        ? body.takenAtSource
        : "manual";
  }

  const thumbnailSize = derivedSize(body.thumbnailSize);
  const previewSize = format.kind === "photo" ? derivedSize(body.previewSize) : null;

  const id = randomUUID();
  const now = new Date();
  const month = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  // Le chemin se termine par le nom d'origine : c'est le nom proposé au téléchargement.
  const keyName = filename.replace(/[#?%]/g, "_");
  const storageKey = `originals/${month}/${id}/${keyName}`;
  const thumbnailKey = thumbnailSize ? `thumbs/${month}/${id}.jpg` : null;
  const previewKey = previewSize ? `previews/${month}/${id}.jpg` : null;

  await db()`
    INSERT INTO media (id, original_filename, mime_type, media_type, size_bytes, storage_key,
                       thumbnail_key, preview_key, taken_at, taken_at_source, photographer,
                       category_id, activity_id, status, upload_state)
    VALUES (${id}, ${filename}, ${format.mime}, ${format.kind}, ${size as number}, ${storageKey},
            ${thumbnailKey}, ${previewKey}, ${takenAt}, ${takenAtSource}, ${photographer},
            ${categoryId}, ${activityId}, 'A_TRIER', 'pending')`;

  if (storageDriver() === "blob") {
    // Vercel Blob : le navigateur demande ensuite une délégation par fichier à /api/uploads/blob.
    return Response.json({
      driver: "blob",
      id,
      contentType: format.mime,
      storageKey,
      thumbnailKey,
      previewKey,
    });
  }

  return Response.json({
    driver: "s3",
    id,
    contentType: format.mime,
    uploadUrl: await presignUpload(storageKey, format.mime, size as number),
    thumbnailUrl: thumbnailKey ? await presignUpload(thumbnailKey, "image/jpeg", thumbnailSize!) : null,
    previewUrl: previewKey ? await presignUpload(previewKey, "image/jpeg", previewSize!) : null,
  });
});
