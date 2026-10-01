import { db } from "@/lib/server/db";
import { assertSameOrigin, badRequest, handler, isUuid, notFound, requireRole } from "@/lib/server/http";
import { deleteObjects, headObject, readHead } from "@/lib/server/storage";
import { extensionOf } from "@/lib/media-types";
import { isJpeg, matchesSignature } from "@/lib/magic";

type Pending = {
  original_filename: string;
  size_bytes: string;
  storage_key: string;
  thumbnail_key: string | null;
  preview_key: string | null;
};

async function checkDerived(key: string | null) {
  if (!key) return null;
  const head = await headObject(key);
  if (!head) return null;
  if (!isJpeg(await readHead(key, 16))) {
    await deleteObjects([key]);
    return null;
  }
  return key;
}

/**
 * Étape 2 de l'import : vérifie côté serveur que le fichier a bien été reçu par le
 * stockage, que sa taille est celle annoncée et que son contenu correspond au format.
 * En cas d'échec, les fichiers et l'enregistrement sont supprimés (pas d'orphelin).
 */
export const POST = handler(async (req: Request, ctx: RouteContext<"/api/uploads/[id]/complete">) => {
  assertSameOrigin(req);
  await requireRole("user");
  const { id } = await ctx.params;
  if (!isUuid(id)) throw notFound();
  const sql = db();
  const [row] = await sql<Pending[]>`
    SELECT original_filename, size_bytes, storage_key, thumbnail_key, preview_key
    FROM media WHERE id = ${id} AND upload_state = 'pending'`;
  if (!row) throw notFound("Import introuvable ou déjà finalisé");

  const allKeys = [row.storage_key, row.thumbnail_key ?? "", row.preview_key ?? ""];
  const reject = async (message: string) => {
    await deleteObjects(allKeys);
    await sql`DELETE FROM media WHERE id = ${id}`;
    return badRequest(message);
  };

  const head = await headObject(row.storage_key);
  if (!head) throw await reject("Le fichier n'a pas été reçu par le stockage");
  if (head.size !== Number(row.size_bytes)) throw await reject("Fichier incomplet, veuillez réessayer");
  const firstBytes = await readHead(row.storage_key, 64);
  if (!matchesSignature(extensionOf(row.original_filename), firstBytes)) {
    throw await reject(`Le contenu de « ${row.original_filename} » ne correspond pas à son format`);
  }

  const thumbnailKey = await checkDerived(row.thumbnail_key);
  const previewKey = await checkDerived(row.preview_key);

  await sql`
    UPDATE media SET upload_state = 'ready', uploaded_at = now(), updated_at = now(),
           thumbnail_key = ${thumbnailKey}, preview_key = ${previewKey}
    WHERE id = ${id}`;
  return Response.json({ ok: true, id });
});
