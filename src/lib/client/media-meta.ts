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
      finish(video.videoWidth ? drawScaled(video, video.videoWidth, video.videoHeight, 640) : null);
    };
    video.onerror = () => {
      clearTimeout(timer);
      finish(null);
    };
    video.src = url;
  });
}

/**
 * Génère, POUR L'AFFICHAGE UNIQUEMENT, une miniature JPEG (640 px) et, pour les formats
 * que les navigateurs n'affichent pas (HEIC, TIFF), un aperçu JPEG (1920 px).
 * L'original n'est jamais modifié.
 */
export async function makeDerivatives(file: File, kind: MediaKind, ext: string) {
  try {
    if (kind === "video") {
      const canvas = await videoFrame(file);
      return { thumbnail: canvas ? await canvasToJpeg(canvas, 0.8) : null, preview: null };
    }
    const bmp = await decodeImage(file, ext);
    if (!bmp) return { thumbnail: null, preview: null };
    const thumbCanvas = drawScaled(bmp, bmp.width, bmp.height, 640);
    const needsPreview = ["heic", "heif", "tif", "tiff"].includes(ext);
    const previewCanvas = needsPreview ? drawScaled(bmp, bmp.width, bmp.height, 1920) : null;
    bmp.close();
    return {
      thumbnail: thumbCanvas ? await canvasToJpeg(thumbCanvas, 0.8) : null,
      preview: previewCanvas ? await canvasToJpeg(previewCanvas, 0.85) : null,
    };
  } catch {
    return { thumbnail: null, preview: null };
  }
}
