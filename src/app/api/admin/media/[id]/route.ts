import { db } from "@/lib/server/db";
import { assertSameOrigin, badRequest, cleanText, handler, isUuid, notFound, readJson, requireRole } from "@/lib/server/http";
import { assertValidClassification } from "@/lib/server/media";

type Body = { photographer?: unknown; categoryId?: unknown; activityId?: unknown; takenAt?: unknown };

/** Correction des métadonnées d'un média par l'administrateur. */
export const PATCH = handler(async (req: Request, ctx: RouteContext<"/api/admin/media/[id]">) => {
  assertSameOrigin(req);
  await requireRole("admin");
  const { id } = await ctx.params;
  if (!isUuid(id)) throw notFound();
  const body = await readJson<Body>(req);
  const photographer = cleanText(body.photographer, "Le photographe", 120);
  const { categoryId, activityId } = await assertValidClassification(body.categoryId, body.activityId);

  let takenAt: Date | null = null;
  const keepDate = body.takenAt === undefined;
  if (typeof body.takenAt === "string" && body.takenAt) {
    takenAt = new Date(body.takenAt);
    if (isNaN(takenAt.getTime())) throw badRequest("Date de prise de vue invalide");
  }

  const sql = db();
  const res = await sql`
    UPDATE media SET photographer = ${photographer}, category_id = ${categoryId},
      activity_id = ${activityId},
      ${keepDate ? sql`` : sql`taken_at = ${takenAt}, taken_at_source = ${takenAt ? "manual" : "none"},`}
      updated_at = now()
    WHERE id = ${id} AND upload_state = 'ready'`;
  if (res.count === 0) throw notFound();
  return Response.json({ ok: true });
});
