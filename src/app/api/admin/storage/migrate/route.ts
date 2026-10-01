import { db } from "@/lib/server/db";
import { assertSameOrigin, badRequest, handler, requireRole } from "@/lib/server/http";
import { blobConfigured, storageDriver } from "@/lib/server/storage";
import * as blob from "@/lib/server/storage-blob";
import * as s3 from "@/lib/server/storage-s3";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const TIME_BUDGET_MS = 240_000;

/**
 * Transfert unique des fichiers de Vercel Blob vers le stockage S3 (Backblaze B2…),
 * une fois ce dernier configuré. Copie les fichiers manquants (originaux, miniatures,
 * aperçus) puis les supprime de Vercel Blob. Rejouable : s'arrête avant la limite de
 * durée et indique ce qu'il reste ; les fichiers déjà copiés sont ignorés.
 */
export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  await requireRole("admin");
  if (storageDriver() !== "s3") throw badRequest("Le stockage S3 n'est pas configuré");
  if (!blobConfigured()) throw badRequest("Aucun stockage Vercel Blob à transférer");

  const started = Date.now();
  const rows = await db()<{ storage_key: string; thumbnail_key: string | null; preview_key: string | null }[]>`
    SELECT storage_key, thumbnail_key, preview_key FROM media ORDER BY uploaded_at`;
  const keys = rows.flatMap((r) => [r.storage_key, r.thumbnail_key, r.preview_key]).filter((k): k is string => !!k);

  let copied = 0;
  let alreadyThere = 0;
  let missing = 0;
  const copiedKeys: string[] = [];
  for (const key of keys) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    if (await s3.headObject(key)) {
      alreadyThere++;
      copiedKeys.push(key); // déjà copié lors d'un passage précédent : reste à libérer côté Blob
      continue;
    }
    const src = await blob.openRead(key);
    if (!src) {
      missing++;
      continue;
    }
    await s3.putObjectStream(key, src.stream, src.contentType, src.size);
    const check = await s3.headObject(key);
    if (!check || check.size !== src.size) throw new Error(`Copie incomplète : ${key}`);
    copied++;
    copiedKeys.push(key);
  }
  // Libère l'espace Vercel Blob (sans échec si un fichier y a déjà été supprimé).
  if (copiedKeys.length > 0) await blob.deleteObjects(copiedKeys).catch(() => {});

  const done = copied + alreadyThere + missing;
  return Response.json({ total: keys.length, copied, alreadyThere, missing, remaining: keys.length - done });
});
