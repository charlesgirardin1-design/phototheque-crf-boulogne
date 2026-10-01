import { handler, requireRole } from "@/lib/server/http";
import { listMedia, parseListParams } from "@/lib/server/media";

export const dynamic = "force-dynamic";

/** Liste paginée, filtrée et triée : réservée à l'administrateur (les utilisateurs ne font qu'importer). */
export const GET = handler(async (req: Request) => {
  const role = await requireRole("admin");
  const params = parseListParams(new URL(req.url).searchParams);
  const result = await listMedia(role, params);
  return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
});
