import { db } from "@/lib/server/db";
import { handler, requireRole } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** Identifiants et volume des médias « TRIÉE » (pour « récupérer et libérer l'espace »). */
export const GET = handler(async () => {
  await requireRole("admin");
  const rows = await db()<{ id: string; bytes: string }[]>`
    SELECT id, size_bytes + derived_bytes AS bytes FROM media
    WHERE status = 'TRIEE' AND upload_state = 'ready'
    ORDER BY uploaded_at
    LIMIT 500`;
  return Response.json({
    ids: rows.map((r) => r.id),
    bytes: rows.reduce((n, r) => n + Number(r.bytes), 0),
  });
});
