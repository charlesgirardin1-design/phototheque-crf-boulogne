import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesSignature } from "../../src/lib/magic";
import { readVideoCreationDate } from "../../src/lib/mp4-date";
import { signSession, verifySession } from "../../src/lib/token";
import { formatFor } from "../../src/lib/media-types";

const pad = (bytes: number[], len = 64) => new Uint8Array([...bytes, ...new Array(len - bytes.length).fill(0)]);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

test("signatures : formats acceptés reconnus", () => {
  assert.ok(matchesSignature("jpg", pad([0xff, 0xd8, 0xff, 0xe1])));
  assert.ok(matchesSignature("JPEG".toLowerCase(), pad([0xff, 0xd8, 0xff, 0xe0])));
  assert.ok(matchesSignature("png", pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])));
  assert.ok(matchesSignature("heic", pad([0, 0, 0, 0x18, ...ascii("ftypheic")])));
  assert.ok(matchesSignature("webp", pad([...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WEBP")])));
  assert.ok(matchesSignature("mp4", pad([0, 0, 0, 0x20, ...ascii("ftypisom")])));
  assert.ok(matchesSignature("mov", pad([0, 0, 0, 0x14, ...ascii("ftypqt  ")])));
  assert.ok(matchesSignature("mov", pad([0, 0, 0, 0x08, ...ascii("wide")])));
});

test("signatures : fichiers déguisés refusés", () => {
  const exe = pad(ascii("MZ\x90\x00"));
  assert.equal(matchesSignature("jpg", exe), false);
  assert.equal(matchesSignature("mp4", exe), false);
  assert.equal(matchesSignature("png", pad([0xff, 0xd8, 0xff])), false);
  assert.equal(matchesSignature("exe", exe), false);
  assert.equal(matchesSignature("jpg", new Uint8Array([0xff, 0xd8])), false);
});

function box(type: string, body: number[]) {
  const size = 8 + body.length;
  return [(size >>> 24) & 255, (size >>> 16) & 255, (size >>> 8) & 255, size & 255, ...ascii(type), ...body];
}

function u32(n: number) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
}

test("date de tournage MP4/MOV lue depuis mvhd", async () => {
  const when = Date.UTC(2024, 5, 15, 14, 30, 0) / 1000 + 2082844800;
  const mvhd = box("mvhd", [0, 0, 0, 0, ...u32(when), ...u32(when), ...u32(1000), ...u32(5000)]);
  const file = new Uint8Array([
    ...box("ftyp", ascii("isom")),
    ...box("mdat", new Array(100).fill(7)),
    ...box("moov", mvhd),
  ]);
  const read = async (o: number, l: number) => file.subarray(o, o + l);
  const d = await readVideoCreationDate(read, file.length);
  assert.equal(d?.toISOString(), "2024-06-15T14:30:00.000Z");
});

test("date de tournage absente → null", async () => {
  const mvhd = box("mvhd", [0, 0, 0, 0, ...u32(0), ...u32(0), ...u32(1000), ...u32(5000)]);
  const file = new Uint8Array([...box("ftyp", ascii("isom")), ...box("moov", mvhd)]);
  const d = await readVideoCreationDate(async (o, l) => file.subarray(o, o + l), file.length);
  assert.equal(d, null);
  const junk = new Uint8Array(ascii("pas une video du tout"));
  assert.equal(await readVideoCreationDate(async (o, l) => junk.subarray(o, o + l), junk.length), null);
});

test("jeton de session : signature, rôle, falsification", async () => {
  const secret = "x".repeat(40);
  const admin = await signSession("admin", secret);
  assert.equal(await verifySession(admin, secret), "admin");
  assert.equal(await verifySession(await signSession("user", secret), secret), "user");
  assert.equal(await verifySession(admin, "y".repeat(40)), null, "autre secret refusé");
  const [h, , s] = admin.split(".");
  const forged = Buffer.from(JSON.stringify({ role: "admin" })).toString("base64url");
  assert.equal(await verifySession(`${h}.${forged}.${s}`, secret), null, "contenu modifié refusé");
  assert.equal(await verifySession("n'importe quoi", secret), null);
  assert.equal(await verifySession(undefined, secret), null);
});

test("formats : extension → type MIME, extension inconnue refusée", () => {
  assert.deepEqual(formatFor("IMG_0001.HEIC"), { ext: "heic", mime: "image/heic", kind: "photo" });
  assert.equal(formatFor("clip.MOV")?.mime, "video/quicktime");
  assert.equal(formatFor("photo.jpeg")?.kind, "photo");
  assert.equal(formatFor("script.exe"), null);
  assert.equal(formatFor("sans-extension"), null);
});
