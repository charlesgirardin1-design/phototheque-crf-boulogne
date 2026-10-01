import { handler, requireRole } from "@/lib/server/http";
import { getStats } from "@/lib/server/stats";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  await requireRole("admin");
  return Response.json(await getStats());
});
