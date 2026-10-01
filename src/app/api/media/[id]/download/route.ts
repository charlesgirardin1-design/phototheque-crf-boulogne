import { handler, isUuid, notFound, requireRole } from "@/lib/server/http";
import { getAccessibleMedia } from "@/lib/server/media";
import { presignGet } from "@/lib/server/storage";

export const dynamic = "force-dynamic";

/**
 * Téléchargement de l'ORIGINAL : redirection vers une URL signée (5 min) qui force
 * le téléchargement sous le nom de fichier d'origine. Le fichier n'est jamais modifié
 * et ne transite pas par la fonction Vercel.
 */
export const GET = handler(async (_req: Request, ctx: RouteContext<"/api/media/[id]/download">) => {
  const role = await requireRole("user");
  const { id } = await ctx.params;
  if (!isUuid(id)) throw notFound();
  const [row] = await getAccessibleMedia(role, [id]);
  if (!row) throw notFound();
  const url = await presignGet(row.storage_key, { downloadName: row.original_filename, expiresIn: 300 });
  return new Response(null, {
    status: 302,
    headers: { Location: url, "Cache-Control": "private, no-store" },
  });
});
