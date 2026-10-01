import { handler, requireRole } from "@/lib/server/http";
import { listMedia, parseListParams } from "@/lib/server/media";

export const dynamic = "force-dynamic";

/** Liste paginée, filtrée et triée. Un utilisateur ne reçoit que les médias « TRIÉE ». */
export const GET = handler(async (req: Request) => {
  const role = await requireRole("user");
  const params = parseListParams(new URL(req.url).searchParams);
  const result = await listMedia(role, params);
  return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
});
