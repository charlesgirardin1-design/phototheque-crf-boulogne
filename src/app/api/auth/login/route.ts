import { db } from "@/lib/server/db";
import { assertSameOrigin, clientIp, handler, HttpError, readJson } from "@/lib/server/http";
import { missingConfig } from "@/lib/server/config-status";
import { roleForPassword, startSession } from "@/lib/server/session";

const MAX_FAILURES = 10;
const WINDOW_MINUTES = 15;

/**
 * Connexion par mot de passe partagé. Le rôle est déterminé côté serveur à partir
 * des variables USER_PASSWORD / ADMIN_PASSWORD ; seul le rôle est renvoyé.
 * Limitation : 10 échecs par IP sur 15 minutes (stockée en base, donc valable
 * sur toutes les instances serverless).
 */
export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  if (missingConfig().length > 0) {
    throw new HttpError(503, "Application en cours d'installation : configuration incomplète");
  }
  const sql = db();
  const ip = clientIp(req);

  const [{ n }] = await sql<{ n: string }[]>`
    SELECT count(*) AS n FROM login_attempts
    WHERE ip = ${ip} AND attempted_at > now() - make_interval(mins => ${WINDOW_MINUTES})`;
  if (Number(n) >= MAX_FAILURES) {
    throw new HttpError(429, "Trop de tentatives. Réessayez dans quelques minutes.");
  }

  const body = await readJson<{ password?: unknown }>(req, 4096);
  const password = typeof body.password === "string" ? body.password : "";
  const role = password ? roleForPassword(password) : null;

  if (!role) {
    await sql`INSERT INTO login_attempts (ip) VALUES (${ip})`;
    // Purge opportuniste des anciennes tentatives.
    await sql`DELETE FROM login_attempts WHERE attempted_at < now() - interval '1 day'`;
    await new Promise((r) => setTimeout(r, 400));
    throw new HttpError(401, "Mot de passe incorrect");
  }

  await sql`DELETE FROM login_attempts WHERE ip = ${ip}`;
  await startSession(role);
  return Response.json({ role });
});
