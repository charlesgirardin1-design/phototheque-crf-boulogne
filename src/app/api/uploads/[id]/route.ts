import { db } from "@/lib/server/db";
import { assertSameOrigin, handler, isUuid, notFound, requireRole } from "@/lib/server/http";
import { deleteObjects } from "@/lib/server/storage";

/** Annulation d'un import en cours : supprime les fichiers partiels et la réservation. */
export const DELETE = handler(async (req: Request, ctx: RouteContext<"/api/uploads/[id]">) => {
  assertSameOrigin(req);
  await requireRole("user");
  const { id } = await ctx.params;
  if (!isUuid(id)) throw notFound();
  const sql = db();
  const [row] = await sql<{ storage_key: string; thumbnail_key: string | null; preview_key: string | null }[]>`
    SELECT storage_key, thumbnail_key, preview_key FROM media WHERE id = ${id} AND upload_state = 'pending'`;
  if (!row) throw notFound();
  await deleteObjects([row.storage_key, row.thumbnail_key ?? "", row.preview_key ?? ""]);
  await sql`DELETE FROM media WHERE id = ${id} AND upload_state = 'pending'`;
  return Response.json({ ok: true });
});
