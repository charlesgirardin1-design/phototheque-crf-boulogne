import { assertSameOrigin, handler, readJson, requireRole, uuidList } from "@/lib/server/http";
import { getAccessibleMedia } from "@/lib/server/media";
import { presignGet } from "@/lib/server/storage";

/**
 * URL signées des originaux pour le téléchargement multiple.
 * L'archive ZIP est assemblée dans le navigateur (sans compression, fichiers intacts) :
 * aucune limite de durée, de mémoire ou de taille de réponse Vercel n'est sollicitée.
 */
export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  const role = await requireRole("user");
  const { ids } = await readJson<{ ids?: unknown }>(req);
  const rows = await getAccessibleMedia(role, uuidList(ids, 500));
  const files = await Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      filename: r.original_filename,
      size: Number(r.size_bytes),
      url: await presignGet(r.storage_key, { expiresIn: 60 * 60 * 3 }),
    })),
  );
  return Response.json({ files });
});
