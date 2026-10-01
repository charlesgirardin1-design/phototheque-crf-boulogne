import { db } from "@/lib/server/db";
import { assertSameOrigin, badRequest, handler, readJson, requireRole, uuidList } from "@/lib/server/http";
import { deleteObjects } from "@/lib/server/storage";

/** Changement de statut (un ou plusieurs médias) : À TRIER ↔ TRIÉE. */
export const PATCH = handler(async (req: Request) => {
  assertSameOrigin(req);
  await requireRole("admin");
  const { ids, status } = await readJson<{ ids?: unknown; status?: unknown }>(req);
  if (status !== "A_TRIER" && status !== "TRIEE") throw badRequest("Statut invalide");
  const list = uuidList(ids);
  const res = await db()`
    UPDATE media SET status = ${status}, updated_at = now()
    WHERE id = ANY(${list}::uuid[]) AND upload_state = 'ready'`;
  return Response.json({ updated: res.count });
});

/**
 * Suppression DÉFINITIVE : les fichiers (original, miniature, aperçu) sont d'abord
 * supprimés du stockage, puis les enregistrements. Si le stockage échoue, la base
 * n'est pas modifiée, l'opération peut être relancée sans créer d'orphelin.
 */
export const DELETE = handler(async (req: Request) => {
  assertSameOrigin(req);
  await requireRole("admin");
  const { ids } = await readJson<{ ids?: unknown }>(req);
  const list = uuidList(ids);
  const sql = db();
  const rows = await sql<{ id: string; storage_key: string; thumbnail_key: string | null; preview_key: string | null }[]>`
    SELECT id, storage_key, thumbnail_key, preview_key FROM media WHERE id = ANY(${list}::uuid[])`;
  if (rows.length === 0) return Response.json({ deleted: 0 });
  await deleteObjects(rows.flatMap((r) => [r.storage_key, r.thumbnail_key ?? "", r.preview_key ?? ""]));
  const res = await sql`DELETE FROM media WHERE id = ANY(${rows.map((r) => r.id)}::uuid[])`;
  return Response.json({ deleted: res.count });
});
