import "server-only";
import postgres from "postgres";
import { env } from "./env";

declare global {
  var __crfSql: postgres.Sql | undefined;
}

/**
 * Client Postgres partagé par instance de fonction.
 * - `prepare: false` : compatible avec les poolers en mode transaction
 *   (Neon pooled, Supabase pooler port 6543…).
 * - pool réduit et `idle_timeout` court : adapté aux fonctions Vercel.
 */
export function db(): postgres.Sql {
  if (!globalThis.__crfSql) {
    globalThis.__crfSql = postgres(env.databaseUrl, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
      onnotice: () => {},
    });
  }
  return globalThis.__crfSql;
}
