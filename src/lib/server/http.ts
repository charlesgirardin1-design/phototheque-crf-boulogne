import "server-only";
import { currentRole, type Role } from "./session";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string) => new HttpError(400, message);
export const notFound = (message = "Média introuvable") => new HttpError(404, message);

/**
 * Exige une session valide. `admin` exige le rôle administrateur.
 * À appeler dans CHAQUE route API : le proxy ne protège que les pages.
 */
export async function requireRole(min: Role): Promise<Role> {
  const role = await currentRole();
  if (!role) throw new HttpError(401, "Session expirée, veuillez vous reconnecter");
  if (min === "admin" && role !== "admin") throw new HttpError(403, "Accès réservé à l'administrateur");
  return role;
}

/**
 * Protection CSRF : les requêtes qui modifient des données doivent venir de l'application.
 * (Le cookie SameSite=Lax couvre déjà la plupart des cas ; ceci est une seconde barrière.)
 */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return; // requêtes same-origin de certains navigateurs, ou outils serveur
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new HttpError(403, "Origine non autorisée");
  }
  if (!host || originHost !== host) throw new HttpError(403, "Origine non autorisée");
}

export async function readJson<T = unknown>(req: Request, maxBytes = 256 * 1024): Promise<T> {
  const text = await req.text();
  if (text.length > maxBytes) throw badRequest("Requête trop volumineuse");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw badRequest("JSON invalide");
  }
}

/** Enveloppe commune : erreurs maîtrisées → message clair ; erreurs internes → message générique. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) {
        return Response.json({ error: err.message }, { status: err.status });
      }
      console.error("[api] erreur interne", err instanceof Error ? err.message : "inconnue");
      return Response.json({ error: "Erreur interne du serveur" }, { status: 500 });
    }
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export function uuidList(v: unknown, max = 1000): string[] {
  if (!Array.isArray(v) || v.length === 0) throw badRequest("Aucun média sélectionné");
  if (v.length > max) throw badRequest(`Maximum ${max} médias par opération`);
  if (!v.every(isUuid)) throw badRequest("Identifiant invalide");
  return [...new Set(v as string[])];
}

export function cleanText(v: unknown, field: string, max: number): string {
  if (typeof v !== "string") throw badRequest(`${field} est obligatoire`);
  const s = v.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!s) throw badRequest(`${field} est obligatoire`);
  if (s.length > max) throw badRequest(`${field} est trop long (${max} caractères max.)`);
  return s;
}

export function clientIp(req: Request) {
  return (
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}
