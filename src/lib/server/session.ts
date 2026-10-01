import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "./env";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession, verifySession, type Role } from "../token";

export type { Role };

/** Rôle de la session courante, vérifié cryptographiquement côté serveur. */
export async function currentRole(): Promise<Role | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value, env.authSecret);
}

export async function startSession(role: Role) {
  const store = await cookies();
  store.set(SESSION_COOKIE, await signSession(role, env.authSecret), {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function endSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Comparaison en temps constant (les empreintes ont toujours la même longueur). */
function safeEqual(a: string, b: string) {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Mots de passe d'un rôle : ADMIN_PASSWORD (ou USER_PASSWORD), plus les variantes
 * facultatives ADMIN_PASSWORD_2, ADMIN_PASSWORD_3… pour donner plusieurs codes d'accès.
 */
function passwordsFor(prefix: "ADMIN_PASSWORD" | "USER_PASSWORD"): string[] {
  const re = new RegExp(`^${prefix}(_\\d+)?$`);
  return Object.entries(process.env)
    .filter(([k, v]) => re.test(k) && typeof v === "string" && v.length > 0)
    .map(([, v]) => v as string);
}

/** Détermine le rôle associé à un mot de passe. Toutes les comparaisons sont toujours effectuées. */
export function roleForPassword(password: string): Role | null {
  // Lève une erreur claire si les variables principales manquent.
  void env.adminPassword;
  void env.userPassword;
  let isAdmin = false;
  let isUser = false;
  for (const p of passwordsFor("ADMIN_PASSWORD")) isAdmin = safeEqual(password, p) || isAdmin;
  for (const p of passwordsFor("USER_PASSWORD")) isUser = safeEqual(password, p) || isUser;
  if (isAdmin) return "admin";
  if (isUser) return "user";
  return null;
}
