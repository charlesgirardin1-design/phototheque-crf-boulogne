import { db } from "@/lib/server/db";
import { assertSameOrigin, handler, isUuid, notFound, readJson, requireRole } from "@/lib/server/http";
import { mapDbError, parseTaxonomyPatch } from "@/lib/server/taxonomy-admin";

type Ctx = RouteContext<"/api/admin/activities/[id]">;

export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  assertSameOrigin(req);
  await requireRole("admin");
  const { id } = await ctx.params;
  if (!isUuid(id)) throw notFound("Activité introuvable");
  const p = parseTaxonomyPatch(await readJson(req));
  const res = await db()`
    UPDATE activities SET
      name = COALESCE(${p.name ?? null}, name),
      is_active = COALESCE(${p.isActive ?? null}, is_active),
      sort_order = COALESCE(${p.sortOrder ?? null}, sort_order)
    WHERE id = ${id}`.catch(mapDbError);
  if (res.count === 0) throw notFound("Activité introuvable");
  return Response.json({ ok: true });
});

/** Suppression possible uniquement si aucun média n'utilise l'activité. */
export const DELETE = handler(async (req: Request, ctx: Ctx) => {
  assertSameOrigin(req);
  await requireRole("admin");
  const { id } = await ctx.params;
  if (!isUuid(id)) throw notFound("Activité introuvable");
  const res = await db()`DELETE FROM activities WHERE id = ${id}`.catch(mapDbError);
  if (res.count === 0) throw notFound("Activité introuvable");
  return Response.json({ ok: true });
});
