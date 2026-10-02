import "server-only";
import type postgres from "postgres";
import { db } from "./db";
import { presignGet } from "./storage";
import { badRequest, isUuid } from "./http";
import { isBrowserDisplayableImage, type MediaStatus } from "../media-types";
import type { Role } from "./session";

export type MediaRow = {
  id: string;
  original_filename: string;
  mime_type: string;
  media_type: "photo" | "video";
  size_bytes: string; // bigint renvoyé en chaîne par le driver
  storage_key: string;
  thumbnail_key: string | null;
  preview_key: string | null;
  placeholder: string | null;
  uploaded_at: Date;
  taken_at: Date | null;
  taken_at_source: string;
  photographer: string;
  category_id: string | null;
  category_name: string | null;
  activity_id: string | null;
  activity_name: string | null;
  status: MediaStatus;
};

export type MediaItem = {
  id: string;
  filename: string;
  mimeType: string;
  mediaType: "photo" | "video";
  size: number;
  uploadedAt: string;
  takenAt: string | null;
  takenAtSource: string;
  photographer: string;
  categoryId: string | null;
  categoryName: string | null;
  activityId: string | null;
  activityName: string | null;
  status: MediaStatus;
  thumbUrl: string | null;
  /** Mini-image floue (quelques centaines d'octets) affichée instantanément pendant le chargement. */
  placeholder: string | null;
  viewUrl: string;
  viewIsOriginal: boolean;
};

const SELECT_MEDIA = (sql: postgres.Sql) => sql`
  SELECT m.id, m.original_filename, m.mime_type, m.media_type, m.size_bytes, m.storage_key,
         m.thumbnail_key, m.preview_key, m.placeholder, m.uploaded_at, m.taken_at, m.taken_at_source,
         m.photographer, m.category_id, c.name AS category_name, m.activity_id,
         a.name AS activity_name, m.status
  FROM media m
  LEFT JOIN categories c ON c.id = m.category_id
  LEFT JOIN activities a ON a.id = m.activity_id
`;

/** Convertit une ligne en objet API avec des URL signées (stables, mises en cache par le navigateur). */
export async function toItem(row: MediaRow): Promise<MediaItem> {
  const thumbUrl = row.thumbnail_key ? await presignGet(row.thumbnail_key, { cacheable: true }) : null;
  // Affichage en grand : l'aperçu allégé (≈ 2048 px) s'il existe — bien plus rapide que
  // l'original de plusieurs Mo —, sinon l'original si le navigateur sait l'afficher.
  // Le TÉLÉCHARGEMENT fournit toujours l'original (route /api/media/[id]/download).
  let viewKey = row.storage_key;
  let viewIsOriginal = true;
  if (row.media_type === "photo" && (row.preview_key || !isBrowserDisplayableImage(row.mime_type))) {
    const derived = row.preview_key ?? row.thumbnail_key;
    if (derived) {
      viewKey = derived;
      viewIsOriginal = false;
    }
  }
  const viewUrl =
    viewKey === row.storage_key
      ? await presignGet(row.storage_key, { inlineName: row.original_filename, cacheable: true })
      : await presignGet(viewKey, { cacheable: true });
  return {
    id: row.id,
    filename: row.original_filename,
    mimeType: row.mime_type,
    mediaType: row.media_type,
    size: Number(row.size_bytes),
    uploadedAt: row.uploaded_at.toISOString(),
    takenAt: row.taken_at ? row.taken_at.toISOString() : null,
    takenAtSource: row.taken_at_source,
    photographer: row.photographer,
    categoryId: row.category_id,
    categoryName: row.category_name,
    activityId: row.activity_id,
    activityName: row.activity_name,
    status: row.status,
    thumbUrl,
    placeholder: row.placeholder,
    viewUrl,
    viewIsOriginal,
  };
}

export type ListParams = {
  q?: string;
  categoryId?: string;
  activityId?: string;
  status?: MediaStatus;
  type?: "photo" | "video";
  from?: string;
  to?: string;
  sort?: "uploaded_at" | "taken_at" | "filename" | "size";
  order?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export function parseListParams(sp: URLSearchParams): ListParams {
  const p: ListParams = {};
  const q = sp.get("q")?.trim();
  if (q) p.q = q.slice(0, 100);
  const cat = sp.get("category");
  if (cat) {
    if (!isUuid(cat)) throw badRequest("Catégorie invalide");
    p.categoryId = cat;
  }
  const act = sp.get("activity");
  if (act) {
    if (!isUuid(act)) throw badRequest("Activité invalide");
    p.activityId = act;
  }
  const status = sp.get("status");
  if (status === "A_TRIER" || status === "TRIEE") p.status = status;
  const type = sp.get("type");
  if (type === "photo" || type === "video") p.type = type;
  for (const k of ["from", "to"] as const) {
    const v = sp.get(k);
    if (v) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw badRequest("Date invalide");
      p[k] = v;
    }
  }
  const sort = sp.get("sort");
  if (sort === "uploaded_at" || sort === "taken_at" || sort === "filename" || sort === "size") p.sort = sort;
  const order = sp.get("order");
  if (order === "asc" || order === "desc") p.order = order;
  const page = Number(sp.get("page") ?? "1");
  p.page = Number.isInteger(page) && page > 0 ? page : 1;
  return p;
}

/**
 * Liste paginée. Un utilisateur non administrateur ne voit QUE les médias triés :
 * ce filtre est imposé ici, côté serveur, quel que soit le paramètre reçu.
 */
export async function listMedia(role: Role, p: ListParams) {
  const sql = db();
  const conds: postgres.PendingQuery<postgres.Row[]>[] = [sql`m.upload_state = 'ready'`];
  if (role !== "admin") conds.push(sql`m.status = 'TRIEE'`);
  else if (p.status) conds.push(sql`m.status = ${p.status}`);
  if (p.categoryId) conds.push(sql`m.category_id = ${p.categoryId}`);
  if (p.activityId) conds.push(sql`m.activity_id = ${p.activityId}`);
  if (p.type) conds.push(sql`m.media_type = ${p.type}`);
  if (p.from) conds.push(sql`COALESCE(m.taken_at, m.uploaded_at) >= ${p.from}::date`);
  if (p.to) conds.push(sql`COALESCE(m.taken_at, m.uploaded_at) < (${p.to}::date + 1)`);
  if (p.q) {
    const like = `%${p.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    conds.push(sql`(m.original_filename ILIKE ${like} OR m.photographer ILIKE ${like}
      OR c.name ILIKE ${like} OR a.name ILIKE ${like})`);
  }
  const where = conds.reduce((acc, c) => sql`${acc} AND ${c}`);

  const dir = p.order === "asc" ? sql`ASC` : sql`DESC`;
  const sortCol =
    p.sort === "taken_at"
      ? sql`COALESCE(m.taken_at, m.uploaded_at)`
      : p.sort === "filename"
        ? sql`lower(m.original_filename)`
        : p.sort === "size"
          ? sql`m.size_bytes`
          : sql`m.uploaded_at`;

  const pageSize = Math.min(p.pageSize ?? 60, 200);
  const page = p.page ?? 1;
  const rows = await sql<(MediaRow & { total: string })[]>`
    ${SELECT_MEDIA(sql)}
    WHERE ${where}
    ORDER BY ${sortCol} ${dir}, m.id
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
  `;
  const [{ count }] = await sql<{ count: string }[]>`
    SELECT count(*) FROM media m
    LEFT JOIN categories c ON c.id = m.category_id
    LEFT JOIN activities a ON a.id = m.activity_id
    WHERE ${where}
  `;
  return {
    items: await Promise.all(rows.map(toItem)),
    total: Number(count),
    page,
    pageSize,
  };
}

/** Médias prêts accessibles au rôle donné (les autres sont ignorés silencieusement). */
export async function getAccessibleMedia(role: Role, ids: string[]) {
  const sql = db();
  return sql<MediaRow[]>`
    ${SELECT_MEDIA(sql)}
    WHERE m.id = ANY(${ids}::uuid[]) AND m.upload_state = 'ready'
      ${role === "admin" ? sql`` : sql`AND m.status = 'TRIEE'`}
  `;
}

export type Taxonomy = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  mediaCount: number;
  activities: { id: string; name: string; sortOrder: number; isActive: boolean; mediaCount: number }[];
}[];

export async function getTaxonomy(includeInactive: boolean): Promise<Taxonomy> {
  const sql = db();
  const cats = await sql<{ id: string; name: string; sort_order: number; is_active: boolean; n: string }[]>`
    SELECT c.id, c.name, c.sort_order, c.is_active,
           (SELECT count(*) FROM media m WHERE m.category_id = c.id) AS n
    FROM categories c
    ${includeInactive ? sql`` : sql`WHERE c.is_active`}
    ORDER BY c.sort_order, c.name
  `;
  const acts = await sql<
    { id: string; category_id: string; name: string; sort_order: number; is_active: boolean; n: string }[]
  >`
    SELECT a.id, a.category_id, a.name, a.sort_order, a.is_active,
           (SELECT count(*) FROM media m WHERE m.activity_id = a.id) AS n
    FROM activities a
    ${includeInactive ? sql`` : sql`WHERE a.is_active`}
    ORDER BY a.sort_order, a.name
  `;
  return cats.map((c) => ({
    id: c.id,
    name: c.name,
    sortOrder: c.sort_order,
    isActive: c.is_active,
    mediaCount: Number(c.n),
    activities: acts
      .filter((a) => a.category_id === c.id)
      .map((a) => ({
        id: a.id,
        name: a.name,
        sortOrder: a.sort_order,
        isActive: a.is_active,
        mediaCount: Number(a.n),
      })),
  }));
}

/** Vérifie que la catégorie (active) et l'activité (active, rattachée à la catégorie) existent. */
export async function assertValidClassification(categoryId: unknown, activityId: unknown) {
  if (!isUuid(categoryId)) throw badRequest("Veuillez choisir une catégorie");
  if (activityId !== null && activityId !== undefined && activityId !== "" && !isUuid(activityId)) {
    throw badRequest("Activité invalide");
  }
  const sql = db();
  const [cat] = await sql`SELECT id FROM categories WHERE id = ${categoryId} AND is_active`;
  if (!cat) throw badRequest("Catégorie inconnue");
  if (isUuid(activityId)) {
    const [act] = await sql`
      SELECT id FROM activities WHERE id = ${activityId} AND category_id = ${categoryId} AND is_active`;
    if (!act) throw badRequest("Cette activité n'appartient pas à la catégorie choisie");
    return { categoryId, activityId: activityId as string };
  }
  return { categoryId, activityId: null };
}
