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

/** Détermine le rôle associé à un mot de passe. Les deux comparaisons sont toujours effectuées. */
export function roleForPassword(password: string): Role | null {
  const isAdmin = safeEqual(password, env.adminPassword);
  const isUser = safeEqual(password, env.userPassword);
  if (isAdmin) return "admin";
  if (isUser) return "user";
  return null;
}
