// Configure le CORS du bucket pour autoriser l'envoi (PUT) et la lecture (GET)
// directement depuis le navigateur, uniquement depuis les origines de l'application.
// Usage : APP_ORIGINS=https://mon-app.vercel.app,http://localhost:3000 \
//         S3_ENDPOINT=... S3_BUCKET=... S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... \
//         node scripts/setup-storage-cors.mjs
import { PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";

const need = ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "APP_ORIGINS"];
const missing = need.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`[cors] variables manquantes : ${missing.join(", ")}`);
  process.exit(1);
}

const origins = process.env.APP_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
const client = new S3Client({
  region: process.env.S3_REGION || "auto",
  endpoint: process.env.S3_ENDPOINT || undefined,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
});

await client.send(
  new PutBucketCorsCommand({
    Bucket: process.env.S3_BUCKET,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: origins,
          AllowedMethods: ["GET", "PUT", "HEAD"],
          AllowedHeaders: ["content-type"],
          ExposeHeaders: ["ETag", "Content-Length"],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  }),
);
console.log(`[cors] CORS configuré pour : ${origins.join(", ")}`);
