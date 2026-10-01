import { db } from "@/lib/server/db";
import { assertSameOrigin, cleanText, handler, readJson, requireRole } from "@/lib/server/http";
import { mapDbError } from "@/lib/server/taxonomy-admin";

export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  await requireRole("admin");
  const { name } = await readJson<{ name?: unknown }>(req);
  const clean = cleanText(name, "Le nom", 80);
  const sql = db();
  const [row] = await sql`
    INSERT INTO categories (name, sort_order)
    VALUES (${clean}, (SELECT COALESCE(max(sort_order), 0) + 1 FROM categories))
    RETURNING id`.catch(mapDbError);
  return Response.json({ id: row.id }, { status: 201 });
});
