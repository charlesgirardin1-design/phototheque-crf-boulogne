// Applique les migrations SQL de db/migrations dans l'ordre alphabétique.
// Chaque migration n'est appliquée qu'une fois (table schema_migrations).
// Usage : DATABASE_URL=... node scripts/migrate.mjs
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  // Sur Vercel, on laisse le build aboutir : le site s'affiche et indique la configuration
  // manquante. Les migrations s'appliqueront au prochain déploiement, une fois la base reliée.
  const onVercel = Boolean(process.env.VERCEL);
  const log = onVercel ? console.warn : console.error;
  log(
    "[migrate] DATABASE_URL n'est pas définie. Configurez-la dans Vercel (Settings → Environment Variables) ou dans .env.local." +
      (onVercel ? " Migrations ignorées pour ce déploiement." : ""),
  );
  process.exit(onVercel ? 0 : 1);
}

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

try {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`;
  const applied = new Set((await sql`SELECT name FROM schema_migrations`).map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const content = await readFile(path.join(dir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(content);
      await tx`INSERT INTO schema_migrations (name) VALUES (${file})`;
    });
    console.log(`[migrate] appliquée : ${file}`);
  }
  console.log("[migrate] base de données à jour");
} catch (err) {
  console.error("[migrate] échec :", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
