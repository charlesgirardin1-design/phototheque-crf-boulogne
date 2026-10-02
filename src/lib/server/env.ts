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
  /**
   * Espace de stockage total. Défaut : 1 Go avec Vercel Blob (offre Hobby), 10 Go avec un
   * stockage S3 (offre gratuite Backblaze B2). STORAGE_QUOTA_GB pour une autre valeur.
   */
  get storageQuotaBytes() {
    const s3 = ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"].every((k) => optional(k));
    const useS3 = process.env.STORAGE_DRIVER === "s3" || (process.env.STORAGE_DRIVER !== "blob" && s3);
    const fallback = useS3 ? 10 : 1;
    const gb = Number(optional("STORAGE_QUOTA_GB") ?? String(fallback));
    return Math.round((Number.isFinite(gb) && gb > 0 ? gb : fallback) * 1_000_000_000);
  },
  get cronSecret() {
    return optional("CRON_SECRET");
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
};
