"use client";

import { readVideoCreationDate } from "../mp4-date";
import type { MediaKind } from "../media-types";

export type TakenAt = { date: Date | null; source: "exif" | "video" | "file" | "none" };

/**
 * Date de prise de vue : EXIF pour les photos (y compris HEIC), boîte mvhd pour les
 * vidéos MP4/MOV, sinon date de dernière modification du fichier (signalée comme telle).
 */
export async function extractTakenAt(file: File, kind: MediaKind, ext: string): Promise<TakenAt> {
  try {
    if (kind === "photo") {
      const exifr = (await import("exifr")).default;
      const tags = await exifr.parse(file, { pick: ["DateTimeOriginal", "CreateDate", "DateTimeDigitized"] });
      const d = tags?.DateTimeOriginal ?? tags?.CreateDate ?? tags?.DateTimeDigitized;
      if (d instanceof Date && !isNaN(d.getTime())) return { date: d, source: "exif" };
    } else if (["mp4", "m4v", "mov", "3gp"].includes(ext)) {
      const d = await readVideoCreationDate(
        async (offset, length) => new Uint8Array(await file.slice(offset, offset + length).arrayBuffer()),
        file.size,
      );
      if (d) return { date: d, source: "video" };
    }
  } catch {
    // Métadonnées illisibles : on continue avec la date du fichier.
  }
  if (file.lastModified) return { date: new Date(file.lastModified), source: "file" };
  return { date: null, source: "none" };
}

async function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality));
}

function drawScaled(source: CanvasImageSource, w: number, h: number, max: number) {
  const scale = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function decodeImage(file: File, ext: string): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // HEIC/HEIF non décodable nativement (hors Safari) : conversion locale pour l'aperçu uniquement.
    if (ext === "heic" || ext === "heif") {
      try {
        const heic2any = (await import("heic2any")).default;
        const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
        const blob = Array.isArray(out) ? out[0] : out;
        return await createImageBitmap(blob);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function videoFrame(file: File): Promise<HTMLCanvasElement | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let done = false;
    const finish = (c: HTMLCanvasElement | null) => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      resolve(c);
    };
    const timer = setTimeout(() => finish(null), 15000);
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(1, (video.duration || 0) / 2);
    };
    video.onseeked = () => {
      clearTimeout(timer);
      finish(video.videoWidth ? drawScaled(video, video.videoWidth, video.videoHeight, THUMB_PX) : null);
    };
    video.onerror = () => {
      clearTimeout(timer);
      finish(null);
    };
    video.src = url;
  });
}

/** Mini-image floue (24 px, quelques centaines d'octets) affichée instantanément. */
function placeholderOf(source: CanvasImageSource, w: number, h: number): string | null {
  const canvas = drawScaled(source, w, h, 24);
  if (!canvas) return null;
  const url = canvas.toDataURL("image/jpeg", 0.5);
  return url.startsWith("data:image/jpeg;base64,") && url.length <= 4000 ? url : null;
}

// Miniature de la grille : 480 px suffisent pour un affichage net sur écran Retina
// (≈ 30-60 Ko au lieu de 100-200 Ko en 640 px).
const THUMB_PX = 480;
const THUMB_QUALITY = 0.78;
// Aperçu plein écran : 2048 px (≈ 300-600 Ko) au lieu d'un original de plusieurs Mo.
const PREVIEW_PX = 2048;
const PREVIEW_QUALITY = 0.82;

/**
 * Génère, POUR L'AFFICHAGE UNIQUEMENT :
 *  - une miniature JPEG (480 px) pour la grille ;
 *  - un aperçu JPEG (2048 px) pour la vue en grand, dès que l'original est lourd ou n'est
 *    pas affichable par les navigateurs (HEIC, TIFF) ;
 *  - une mini-image floue pour un affichage instantané.
 * L'ORIGINAL n'est jamais modifié : il reste téléchargeable tel quel.
 */
export async function makeDerivatives(file: File, kind: MediaKind, ext: string) {
  const none = { thumbnail: null, preview: null, placeholder: null };
  try {
    if (kind === "video") {
      const canvas = await videoFrame(file);
      return {
        thumbnail: canvas ? await canvasToJpeg(canvas, THUMB_QUALITY) : null,
        preview: null,
        placeholder: canvas ? placeholderOf(canvas, canvas.width, canvas.height) : null,
      };
    }
    const bmp = await decodeImage(file, ext);
    if (!bmp) return none;
    const thumbCanvas = drawScaled(bmp, bmp.width, bmp.height, THUMB_PX);
    const notDisplayable = ["heic", "heif", "tif", "tiff"].includes(ext);
    const heavy = file.size > 1_500_000 || Math.max(bmp.width, bmp.height) > PREVIEW_PX;
    const previewCanvas = notDisplayable || heavy ? drawScaled(bmp, bmp.width, bmp.height, PREVIEW_PX) : null;
    const placeholder = placeholderOf(bmp, bmp.width, bmp.height);
    bmp.close();
    return {
      thumbnail: thumbCanvas ? await canvasToJpeg(thumbCanvas, THUMB_QUALITY) : null,
      preview: previewCanvas ? await canvasToJpeg(previewCanvas, PREVIEW_QUALITY) : null,
      placeholder,
    };
  } catch {
    return none;
  }
}
