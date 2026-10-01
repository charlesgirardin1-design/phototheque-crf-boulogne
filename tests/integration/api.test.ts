/**
 * Tests d'intégration de bout en bout contre une instance en marche.
 * ⚠️ Crée puis supprime des données : à lancer sur un environnement de test, jamais en production.
 *
 * BASE_URL=http://localhost:3000 USER_PASSWORD=… ADMIN_PASSWORD=… CRON_SECRET=… npm run test:integration
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const ORIGIN = new URL(BASE).origin;

type Client = { cookie?: string };
const anon: Client = {};
const user: Client = {};
const admin: Client = {};

async function call(c: Client, path: string, init: RequestInit & { json?: unknown } = {}) {
  const headers = new Headers(init.headers);
  if (c.cookie) headers.set("cookie", c.cookie);
  if (init.json !== undefined) headers.set("content-type", "application/json");
  if (init.method && init.method !== "GET") headers.set("origin", headers.get("origin") ?? ORIGIN);
  const res = await fetch(BASE + path, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    redirect: "manual",
  });
  const set = res.headers.get("set-cookie");
  if (set) c.cookie = set.split(";")[0];
  return res;
}

const body = async (r: Response) => r.json() as Promise<Record<string, unknown> & { error?: string }>;

async function login(c: Client, password: string, ip = "10.0.0.1") {
  return call(c, "/api/auth/login", { method: "POST", json: { password }, headers: { "x-real-ip": ip } });
}

function fakeJpeg(size = 4096) {
  const b = randomBytes(size);
  b[0] = 0xff;
  b[1] = 0xd8;
  b[2] = 0xff;
  return b;
}

function fakeMp4(size = 2048) {
  const b = randomBytes(size);
  b.writeUInt32BE(24, 0);
  b.write("ftypisom", 4, "latin1");
  return b;
}

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

let taxonomy: { id: string; name: string; activities: { id: string; name: string }[] }[] = [];

async function upload(
  c: Client,
  filename: string,
  data: Buffer,
  meta: Partial<{ categoryId: string; activityId: string | null; photographer: string; takenAt: string }> = {},
) {
  const autre = taxonomy.find((t) => t.name === "Autre")!;
  const prep = await call(c, "/api/uploads", {
    method: "POST",
    json: {
      filename,
      size: data.length,
      photographer: meta.photographer ?? "Test Photographe",
      categoryId: meta.categoryId ?? autre.id,
      activityId: meta.activityId === undefined ? autre.activities[0].id : meta.activityId,
      takenAt: meta.takenAt ?? "2024-06-15T10:00:00.000Z",
      takenAtSource: "exif",
    },
  });
  const p = await body(prep);
  if (prep.status !== 200) return { prepStatus: prep.status, error: p.error } as const;
  const put = await fetch(p.uploadUrl as string, {
    method: "PUT",
    body: new Uint8Array(data),
    headers: { "content-type": p.contentType as string },
  });
  assert.equal(put.status, 200, "PUT vers le stockage");
  const done = await call(c, `/api/uploads/${p.id}/complete`, { method: "POST" });
  return { prepStatus: 200, id: p.id as string, completeStatus: done.status, completeBody: await body(done) } as const;
}

test("accès anonyme refusé", async () => {
  assert.equal((await call(anon, "/api/media")).status, 401);
  assert.equal((await call(anon, "/api/admin/stats")).status, 401);
  for (const page of ["/galerie", "/importer", "/admin", "/admin/medias"]) {
    const r = await call(anon, page);
    assert.equal(r.status, 307, page);
    assert.equal(new URL(r.headers.get("location")!, BASE).pathname, "/");
  }
});

test("mauvais mot de passe : refus sans fuite d'information", async () => {
  const r = await login({}, "mauvais", "10.0.0.50");
  assert.equal(r.status, 401);
  const b = await body(r);
  assert.equal(b.error, "Mot de passe incorrect");
  assert.equal(r.headers.get("set-cookie"), null);
});

test("connexions utilisateur et administrateur", async () => {
  const u = await login(user, process.env.USER_PASSWORD!);
  assert.equal(u.status, 200);
  assert.deepEqual(await body(u), { role: "user" });
  assert.match(u.headers.get("set-cookie")!, /HttpOnly/i);
  const a = await login(admin, process.env.ADMIN_PASSWORD!);
  assert.equal(a.status, 200);
  assert.deepEqual(await body(a), { role: "admin" });
  taxonomy = (await body(await call(admin, "/api/taxonomy"))).categories as typeof taxonomy;
  const names = taxonomy.map((t) => t.name);
  for (const n of ["US", "AS", "Activité de transfert", "Autre"]) assert.ok(names.includes(n), n);
  assert.ok(taxonomy.find((t) => t.name === "Autre")!.activities.some((a) => a.name === "Formation"));
});

test("un utilisateur ne peut rien faire d'administrateur", async () => {
  assert.equal((await call(user, "/api/admin/stats")).status, 403);
  assert.equal((await call(user, "/api/admin/media", { method: "DELETE", json: { ids: [crypto.randomUUID()] } })).status, 403);
  assert.equal((await call(user, "/api/admin/media", { method: "PATCH", json: { ids: [crypto.randomUUID()], status: "TRIEE" } })).status, 403);
  assert.equal((await call(user, "/api/admin/categories", { method: "POST", json: { name: "Pirate" } })).status, 403);
  const page = await call(user, "/admin");
  assert.equal(page.status, 307);
  assert.equal(new URL(page.headers.get("location")!, BASE).pathname, "/importer");
  // Cookie falsifié
  const forged: Client = { cookie: "crf_session=eyJhbGciOiJub25lIn0.eyJyb2xlIjoiYWRtaW4ifQ." };
  assert.equal((await call(forged, "/api/admin/stats")).status, 401);
});

test("protection CSRF : origine étrangère refusée", async () => {
  const r = await call(admin, "/api/admin/categories", {
    method: "POST",
    json: { name: "X" },
    headers: { origin: "https://evil.example" },
  });
  assert.equal(r.status, 403);
});

test("import, statut, visibilité, téléchargement de l'original intact, suppression", async () => {
  const jpg = fakeJpeg(50_000);
  const mp4 = fakeMp4(30_000);
  const p = await upload(user, "IMG 2024 été.JPG", jpg, { photographer: "Marie Dupont" });
  assert.equal(p.completeStatus, 200, JSON.stringify(p));
  const v = await upload(user, "clip.mov", mp4, { photographer: "Jean Martin" });
  assert.equal(v.completeStatus, 200);

  // Nouveau média : « À TRIER », visible pour l'admin.
  const adminList = await body(await call(admin, "/api/media?status=A_TRIER&q=Marie"));
  const item = (adminList.items as Record<string, unknown>[]).find((i) => i.id === p.id)!;
  assert.equal(item.status, "A_TRIER");
  assert.equal(item.filename, "IMG 2024 été.JPG");
  assert.equal(item.mimeType, "image/jpeg");
  assert.equal(item.photographer, "Marie Dupont");
  assert.equal(item.categoryName, "Autre");
  assert.equal(item.activityName, "Formation");
  assert.equal(item.takenAt, "2024-06-15T10:00:00.000Z");

  // L'utilisateur ne fait qu'importer : aucune consultation ni téléchargement.
  assert.equal((await call(user, "/api/media")).status, 403);
  assert.equal((await call(user, `/api/media/${p.id}/download`)).status, 403);
  assert.equal(
    (await call(user, "/api/media/download-urls", { method: "POST", json: { ids: [p.id] } })).status,
    403,
  );

  // Filtres
  const videos = await body(await call(admin, "/api/media?type=video&q=Jean"));
  assert.ok((videos.items as { id: string }[]).every((i) => i.id !== p.id));
  assert.ok((videos.items as { id: string }[]).some((i) => i.id === v.id));

  // Passage à TRIÉE puis retour possible
  let r = await call(admin, "/api/admin/media", { method: "PATCH", json: { ids: [p.id, v.id], status: "TRIEE" } });
  assert.deepEqual(await body(r), { updated: 2 });

  // Téléchargement : original octet pour octet, sous son nom d'origine.
  const dl = await call(admin, `/api/media/${p.id}/download`);
  assert.equal(dl.status, 302);
  const file = await fetch(dl.headers.get("location")!);
  const bytes = new Uint8Array(await file.arrayBuffer());
  assert.equal(sha(bytes), sha(jpg), "fichier strictement identique");
  assert.match(file.headers.get("content-disposition") ?? "", /attachment/);
  assert.match(file.headers.get("content-disposition") ?? "", /IMG%202024%20%C3%A9t%C3%A9\.JPG/);

  // Téléchargement multiple : URL des originaux
  const multi = await body(await call(admin, "/api/media/download-urls", { method: "POST", json: { ids: [p.id, v.id] } }));
  const files = multi.files as { url: string; filename: string }[];
  assert.equal(files.length, 2);
  const vid = files.find((f) => f.filename === "clip.mov")!;
  assert.equal(sha(new Uint8Array(await (await fetch(vid.url)).arrayBuffer())), sha(mp4));

  r = await call(admin, "/api/admin/media", { method: "PATCH", json: { ids: [p.id], status: "A_TRIER" } });
  assert.deepEqual(await body(r), { updated: 1 });

  // Modification des métadonnées
  const us = taxonomy.find((t) => t.name === "US")!;
  r = await call(admin, `/api/admin/media/${v.id}`, {
    method: "PATCH",
    json: { photographer: "Jean M.", categoryId: us.id, activityId: null },
  });
  assert.equal(r.status, 200);

  // Suppression multiple réelle : base + stockage
  const del = await call(admin, "/api/admin/media", { method: "DELETE", json: { ids: [p.id, v.id] } });
  assert.deepEqual(await body(del), { deleted: 2 });
  assert.equal((await fetch(vid.url)).status, 404, "fichier supprimé du stockage");
  assert.equal((await call(admin, `/api/media/${p.id}/download`)).status, 404);
});

test("validation des imports", async () => {
  const exe = Buffer.concat([Buffer.from("MZ"), randomBytes(5000)]);
  const bad = await upload(user, "photo.jpg", exe);
  assert.equal(bad.completeStatus, 400, "contenu non conforme refusé");
  assert.match(String(bad.completeBody?.error), /ne correspond pas/);
  const gone = await body(await call(admin, "/api/media?q=photo.jpg"));
  assert.ok(!(gone.items as { id: string }[]).some((i) => i.id === bad.id), "aucun enregistrement orphelin");

  const ext = await upload(user, "virus.exe", exe);
  assert.equal(ext.prepStatus, 400);

  const us = taxonomy.find((t) => t.name === "US")!;
  const autre = taxonomy.find((t) => t.name === "Autre")!;
  const mismatch = await upload(user, "a.jpg", fakeJpeg(), { categoryId: us.id, activityId: autre.activities[0].id });
  assert.equal(mismatch.prepStatus, 400, "activité hors catégorie refusée");

  const noPhotographer = await upload(user, "a.jpg", fakeJpeg(), { photographer: "   " });
  assert.equal(noPhotographer.prepStatus, 400);

  const huge = await call(user, "/api/uploads", {
    method: "POST",
    json: { filename: "big.mp4", size: 10 * 1024 ** 4, photographer: "X", categoryId: us.id },
  });
  assert.equal(huge.status, 400);

  // Annulation : la réservation est supprimée
  const prep = await body(
    await call(user, "/api/uploads", {
      method: "POST",
      json: { filename: "annule.png", size: 100, photographer: "X", categoryId: us.id },
    }),
  );
  assert.equal((await call(user, `/api/uploads/${prep.id}`, { method: "DELETE" })).status, 200);
  assert.equal((await call(user, `/api/uploads/${prep.id}/complete`, { method: "POST" })).status, 404);
});

test("gestion des catégories et activités", async () => {
  const name = `Test ${Date.now()}`;
  let r = await call(admin, "/api/admin/categories", { method: "POST", json: { name } });
  assert.equal(r.status, 201);
  const catId = (await body(r)).id as string;
  assert.equal((await call(admin, "/api/admin/categories", { method: "POST", json: { name } })).status, 409);
  r = await call(admin, "/api/admin/activities", { method: "POST", json: { categoryId: catId, name: "Exercice" } });
  assert.equal(r.status, 201);
  const actId = (await body(r)).id as string;
  assert.equal((await call(admin, `/api/admin/categories/${catId}`, { method: "DELETE" })).status, 409);

  // Désactivée : n'est plus proposée ni acceptée à l'import
  await call(admin, `/api/admin/categories/${catId}`, { method: "PATCH", json: { isActive: false } });
  const userTax = await body(await call(user, "/api/taxonomy"));
  assert.ok(!(userTax.categories as { id: string }[]).some((c) => c.id === catId));
  const refused = await upload(user, "a.jpg", fakeJpeg(), { categoryId: catId, activityId: null });
  assert.equal(refused.prepStatus, 400);

  r = await call(admin, `/api/admin/activities/${actId}`, { method: "PATCH", json: { name: "Exercice renommé" } });
  assert.equal(r.status, 200);
  assert.equal((await call(admin, `/api/admin/activities/${actId}`, { method: "DELETE" })).status, 200);
  assert.equal((await call(admin, `/api/admin/categories/${catId}`, { method: "DELETE" })).status, 200);
});

test("tâche planifiée protégée par secret", async () => {
  assert.equal((await call(anon, "/api/cron/cleanup")).status, 401);
  const r = await call(anon, "/api/cron/cleanup", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  assert.equal(r.status, 200);
});

test("limitation des tentatives de connexion", async () => {
  const ip = `10.9.${Math.floor(Math.random() * 250)}.1`;
  for (let i = 0; i < 10; i++) assert.equal((await login({}, `faux-${i}`, ip)).status, 401);
  assert.equal((await login({}, process.env.ADMIN_PASSWORD!, ip)).status, 429, "bloqué même avec le bon mot de passe");
});

test("déconnexion", async () => {
  const c: Client = {};
  await login(c, process.env.USER_PASSWORD!, "10.0.0.2");
  await call(c, "/api/auth/logout", { method: "POST" });
  assert.equal((await call(c, "/api/media")).status, 401);
});
