import { db } from "@/lib/server/db";
import { assertSameOrigin, handler, isUuid, notFound, readJson, requireRole } from "@/lib/server/http";
import { mapDbError, parseTaxonomyPatch } from "@/lib/server/taxonomy-admin";

type Ctx = RouteContext<"/api/admin/categories/[id]">;

/** Renommer, réordonner, activer/désactiver une catégorie. */
export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  assertSameOrigin(req);
  await requireRole("admin");
  const { id } = await ctx.params;
  if (!isUuid(id)) throw notFound("Catégorie introuvable");
  const p = parseTaxonomyPatch(await readJson(req));
  const sql = db();
  const res = await sql`
    UPDATE categories SET
      name = COALESCE(${p.name ?? null}, name),
      is_active = COALESCE(${p.isActive ?? null}, is_active),
      sort_order = COALESCE(${p.sortOrder ?? null}, sort_order)
    WHERE id = ${id}`.catch(mapDbError);
  if (res.count === 0) throw notFound("Catégorie introuvable");
  return Response.json({ ok: true });
});

/** Suppression possible uniquement si aucune activité ni aucun média n'y est rattaché. */
export const DELETE = handler(async (req: Request, ctx: Ctx) => {
  assertSameOrigin(req);
  await requireRole("admin");
  const { id } = await ctx.params;
  if (!isUuid(id)) throw notFound("Catégorie introuvable");
  const res = await db()`DELETE FROM categories WHERE id = ${id}`.catch(mapDbError);
  if (res.count === 0) throw notFound("Catégorie introuvable");
  return Response.json({ ok: true });
});
