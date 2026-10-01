import { db } from "@/lib/server/db";
import { assertSameOrigin, badRequest, cleanText, handler, isUuid, readJson, requireRole } from "@/lib/server/http";
import { mapDbError } from "@/lib/server/taxonomy-admin";

export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  await requireRole("admin");
  const { name, categoryId } = await readJson<{ name?: unknown; categoryId?: unknown }>(req);
  if (!isUuid(categoryId)) throw badRequest("Catégorie invalide");
  const clean = cleanText(name, "Le nom", 80);
  const sql = db();
  const [row] = await sql`
    INSERT INTO activities (category_id, name, sort_order)
    VALUES (${categoryId}, ${clean},
      (SELECT COALESCE(max(sort_order), 0) + 1 FROM activities WHERE category_id = ${categoryId}))
    RETURNING id`.catch(mapDbError);
  return Response.json({ id: row.id }, { status: 201 });
});
