import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/server/db";
import { env } from "@/lib/server/env";
import { handler, HttpError } from "@/lib/server/http";
import { deleteObjects } from "@/lib/server/storage";

export const dynamic = "force-dynamic";

/**
 * Tâche planifiée (Vercel Cron, voir vercel.json) : supprime les imports abandonnés
 * depuis plus de 24 h (fenêtre fermée, réseau coupé…) et leurs fichiers partiels,
 * ainsi que l'historique des tentatives de connexion.
 * Vercel envoie automatiquement « Authorization: Bearer $CRON_SECRET ».
 */
export const GET = handler(async (req: Request) => {
  const secret = env.cronSecret;
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (
    !secret ||
    given.length !== expected.length ||
    !timingSafeEqual(Buffer.from(given), Buffer.from(expected))
  ) {
    throw new HttpError(401, "Non autorisé");
  }

  const sql = db();
  const stale = await sql<{ id: string; storage_key: string; thumbnail_key: string | null; preview_key: string | null }[]>`
    SELECT id, storage_key, thumbnail_key, preview_key FROM media
    WHERE upload_state = 'pending' AND uploaded_at < now() - interval '24 hours'
    LIMIT 500`;
  if (stale.length > 0) {
    await deleteObjects(stale.flatMap((r) => [r.storage_key, r.thumbnail_key ?? "", r.preview_key ?? ""]));
    await sql`DELETE FROM media WHERE id = ANY(${stale.map((r) => r.id)}::uuid[]) AND upload_state = 'pending'`;
  }
  await sql`DELETE FROM login_attempts WHERE attempted_at < now() - interval '1 day'`;
  return Response.json({ removedPendingUploads: stale.length });
});
