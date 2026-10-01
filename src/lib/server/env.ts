import "server-only";

/**
 * Lecture centralisée des variables d'environnement côté serveur.
 * Les messages d'erreur citent le NOM de la variable, jamais sa valeur.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Variable d'environnement manquante : ${name}`);
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value : undefined;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get authSecret() {
    const secret = required("AUTH_SECRET");
    if (secret.length < 32) {
      throw new Error("AUTH_SECRET doit contenir au moins 32 caractères");
    }
    return secret;
  },
  get userPassword() {
    return required("USER_PASSWORD");
  },
  get adminPassword() {
    return required("ADMIN_PASSWORD");
  },
  get s3() {
    return {
      endpoint: optional("S3_ENDPOINT"),
      region: optional("S3_REGION") ?? "auto",
      bucket: required("S3_BUCKET"),
      accessKeyId: required("S3_ACCESS_KEY_ID"),
      secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
      forcePathStyle: optional("S3_FORCE_PATH_STYLE") === "true",
    };
  },
  get maxUploadBytes() {
    const mb = Number(optional("MAX_UPLOAD_SIZE_MB") ?? "5000");
    // Un PUT S3 unique est limité à 5 Gio.
    const safeMb = Number.isFinite(mb) && mb > 0 ? Math.min(mb, 5120) : 5000;
    return Math.floor(safeMb * 1024 * 1024);
  },
  /** Espace de stockage total (défaut : 1 Go, offre Vercel Hobby). STORAGE_QUOTA_GB pour une autre offre. */
  get storageQuotaBytes() {
    const gb = Number(optional("STORAGE_QUOTA_GB") ?? "1");
    return Math.round((Number.isFinite(gb) && gb > 0 ? gb : 1) * 1_000_000_000);
  },
  get cronSecret() {
    return optional("CRON_SECRET");
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
};
