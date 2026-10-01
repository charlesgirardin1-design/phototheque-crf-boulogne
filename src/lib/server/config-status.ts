import "server-only";

const has = (k: string) => Boolean(process.env[k]?.trim());

/** Noms (jamais les valeurs) des variables obligatoires absentes ou invalides. */
export function missingConfig(): string[] {
  const missing = ["DATABASE_URL", "AUTH_SECRET", "USER_PASSWORD", "ADMIN_PASSWORD"].filter((k) => !has(k));
  const secret = process.env.AUTH_SECRET;
  if (secret && secret.length < 32) missing.push("AUTH_SECRET (32 caractères minimum)");
  const blob = has("BLOB_STORE_ID") || has("BLOB_READ_WRITE_TOKEN");
  const s3 = has("S3_BUCKET") && has("S3_ACCESS_KEY_ID") && has("S3_SECRET_ACCESS_KEY");
  if (!blob && !s3) missing.push("Stockage : relier un Vercel Blob privé (ou S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY)");
  return missing;
}
