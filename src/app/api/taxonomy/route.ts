import { handler, requireRole } from "@/lib/server/http";
import { getTaxonomy } from "@/lib/server/media";

export const dynamic = "force-dynamic";

/** Catégories et activités. `?all=1` (administrateur uniquement) inclut les éléments désactivés. */
export const GET = handler(async (req: Request) => {
  const role = await requireRole("user");
  const all = role === "admin" && new URL(req.url).searchParams.get("all") === "1";
  return Response.json({ categories: await getTaxonomy(all) });
});
