import "server-only";
import { badRequest, cleanText, HttpError } from "./http";

export function parseTaxonomyPatch(body: { name?: unknown; isActive?: unknown; sortOrder?: unknown }) {
  const patch: { name?: string; isActive?: boolean; sortOrder?: number } = {};
  if (body.name !== undefined) patch.name = cleanText(body.name, "Le nom", 80);
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") throw badRequest("Valeur invalide");
    patch.isActive = body.isActive;
  }
  if (body.sortOrder !== undefined) {
    if (!Number.isInteger(body.sortOrder)) throw badRequest("Ordre invalide");
    patch.sortOrder = body.sortOrder as number;
  }
  return patch;
}

/** Traduit les violations de contraintes Postgres en messages clairs. */
export function mapDbError(err: unknown): never {
  const code = (err as { code?: string }).code;
  if (code === "23505") throw new HttpError(409, "Ce nom existe déjà");
  if (code === "23503") {
    throw new HttpError(409, "Élément utilisé par des médias ou des activités : désactivez-le plutôt");
  }
  throw err;
}
