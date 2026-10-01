import "server-only";

const REQUIRED = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "USER_PASSWORD",
  "ADMIN_PASSWORD",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
] as const;

/** Noms (jamais les valeurs) des variables obligatoires absentes ou invalides. */
export function missingConfig(): string[] {
  const missing: string[] = REQUIRED.filter((k) => !process.env[k]?.trim());
  const secret = process.env.AUTH_SECRET;
  if (secret && secret.length < 32) missing.push("AUTH_SECRET (32 caractères minimum)");
  return missing;
}
