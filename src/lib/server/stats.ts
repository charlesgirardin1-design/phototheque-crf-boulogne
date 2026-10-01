import "server-only";
import { db } from "./db";

export async function getStats() {
  const sql = db();
  const [totals] = await sql<
    { total: string; to_sort: string; sorted: string; photos: string; videos: string; bytes: string | null }[]
  >`
    SELECT count(*) AS total,
           count(*) FILTER (WHERE status = 'A_TRIER') AS to_sort,
           count(*) FILTER (WHERE status = 'TRIEE') AS sorted,
           count(*) FILTER (WHERE media_type = 'photo') AS photos,
           count(*) FILTER (WHERE media_type = 'video') AS videos,
           sum(size_bytes) AS bytes
    FROM media WHERE upload_state = 'ready'`;
  const byCategory = await sql<{ name: string; n: string }[]>`
    SELECT COALESCE(c.name, 'Sans catégorie') AS name, count(*) AS n
    FROM media m LEFT JOIN categories c ON c.id = m.category_id
    WHERE m.upload_state = 'ready'
    GROUP BY 1 ORDER BY 2 DESC`;
  return {
    total: Number(totals.total),
    toSort: Number(totals.to_sort),
    sorted: Number(totals.sorted),
    photos: Number(totals.photos),
    videos: Number(totals.videos),
    bytes: Number(totals.bytes ?? 0),
    byCategory: byCategory.map((r) => ({ name: r.name, count: Number(r.n) })),
  };
}
