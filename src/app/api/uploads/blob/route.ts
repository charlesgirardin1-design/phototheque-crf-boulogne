import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { db } from "@/lib/server/db";
import { assertSameOrigin, badRequest, handler, HttpError, isUuid, readJson, requireRole } from "@/lib/server/http";
import { uploadDelegation } from "@/lib/server/storage";

const MAX_DERIVED_BYTES = 8 * 1024 * 1024;

type Pending = {
  mime_type: string;
  size_bytes: string;
  storage_key: string;
  thumbnail_key: string | null;
  preview_key: string | null;
};

/**
 * Vercel Blob : délivre au navigateur une autorisation d'envoi direct (sans transiter
 * par la fonction), valable pour UN seul chemin réservé par /api/uploads, avec le type
 * et la taille attendus. Toute autre demande est refusée.
 */
export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  await requireRole("user");
  const body = await readJson<HandleUploadPresignedBody>(req, 64 * 1024);
  if (body?.type !== "blob.generate-presigned-url") throw badRequest("Requête invalide");

  const result = await handleUploadPresigned({
    body,
    request: req,
    getSignedToken: async (pathname, clientPayload) => {
      let payload: { id?: unknown; kind?: unknown };
      try {
        payload = JSON.parse(clientPayload ?? "");
      } catch {
        throw badRequest("Requête invalide");
      }
      if (!isUuid(payload.id)) throw badRequest("Requête invalide");
      const [row] = await db()<Pending[]>`
        SELECT mime_type, size_bytes, storage_key, thumbnail_key, preview_key
        FROM media WHERE id = ${payload.id} AND upload_state = 'pending'`;
      if (!row) throw new HttpError(404, "Import introuvable ou déjà finalisé");

      const target =
        payload.kind === "original"
          ? { key: row.storage_key, type: row.mime_type, max: Number(row.size_bytes) }
          : payload.kind === "thumbnail" && row.thumbnail_key
            ? { key: row.thumbnail_key, type: "image/jpeg", max: MAX_DERIVED_BYTES }
            : payload.kind === "preview" && row.preview_key
              ? { key: row.preview_key, type: "image/jpeg", max: MAX_DERIVED_BYTES }
              : null;
      if (!target || pathname !== target.key) throw new HttpError(403, "Chemin d'envoi non autorisé");

      return {
        token: await uploadDelegation(target.key, target.type, target.max),
        urlOptions: { allowOverwrite: false, addRandomSuffix: false },
      };
    },
  });
  return Response.json(result);
});
