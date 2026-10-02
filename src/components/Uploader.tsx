"use client";

import { useEffect, useRef, useState } from "react";
import { api, putFile } from "@/lib/client/api";
import { sendToBlob } from "@/lib/client/blob-upload";
import { extractTakenAt, makeDerivatives } from "@/lib/client/media-meta";
import { ACCEPT_ATTRIBUTE, formatBytes, formatFor } from "@/lib/media-types";
import { useTaxonomy } from "./useTaxonomy";

type ItemState = "queued" | "analyzing" | "uploading" | "verifying" | "done" | "error" | "cancelled";

type QueueItem = {
  key: string;
  file: File;
  kind: "photo" | "video";
  ext: string;
  state: ItemState;
  progress: number; // 0..1
  error?: string;
  takenAt?: Date | null;
  takenAtSource?: string;
};

const STATE_LABEL: Record<ItemState, string> = {
  queued: "En attente",
  analyzing: "Analyse…",
  uploading: "Envoi…",
  verifying: "Vérification…",
  done: "Importé",
  error: "Erreur",
  cancelled: "Annulé",
};

type PrepareResponse =
  | {
      driver: "s3";
      id: string;
      contentType: string;
      uploadUrl: string;
      thumbnailUrl: string | null;
      previewUrl: string | null;
    }
  | {
      driver: "blob";
      id: string;
      contentType: string;
      storageKey: string;
      thumbnailKey: string | null;
      previewKey: string | null;
    };

const CONCURRENCY = 3;
const PHOTOGRAPHER_KEY = "crf-photographer";

export function Uploader() {
  const { categories } = useTaxonomy();
  const [photographer, setPhotographer] = useState("");
  const [categoryId, setCategoryId] = useState("");
  // Date saisie (AAAA-MM-JJ) : si renseignée, elle s'applique à tous les fichiers de l'import.
  const [manualDate, setManualDate] = useState("");
  const [activityId, setActivityId] = useState("");
  const [items, setItems] = useState<QueueItem[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const controllers = useRef(new Map<string, AbortController>());
  const cancelled = useRef(new Set<string>());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PHOTOGRAPHER_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restauration d'une préférence locale
      if (saved) setPhotographer(saved);
    } catch {
      /* stockage local indisponible */
    }
  }, []);

  useEffect(() => {
    if (!running) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  const category = categories.find((c) => c.id === categoryId);
  const update = (key: string, patch: Partial<QueueItem>) =>
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  function addFiles(list: FileList | File[]) {
    const accepted: QueueItem[] = [];
    const refused: string[] = [];
    for (const file of Array.from(list)) {
      const fmt = formatFor(file.name);
      if (!fmt) {
        refused.push(file.name);
        continue;
      }
      accepted.push({
        key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
        file,
        kind: fmt.kind,
        ext: fmt.ext,
        state: "queued",
        progress: 0,
      });
    }
    setRejected(refused);
    setItems((prev) => [...prev, ...accepted]);
  }

  async function uploadOne(item: QueueItem) {
    const ctrl = new AbortController();
    controllers.current.set(item.key, ctrl);
    let uploadId: string | null = null;
    try {
      update(item.key, { state: "analyzing", error: undefined, progress: 0 });
      const taken = manualDate
        ? { date: new Date(`${manualDate}T12:00:00`), source: "manual" as const }
        : await extractTakenAt(item.file, item.kind, item.ext);
      const derived = await makeDerivatives(item.file, item.kind, item.ext);
      update(item.key, { takenAt: taken.date, takenAtSource: taken.source });
      if (ctrl.signal.aborted) throw new DOMException("Envoi annulé", "AbortError");

      const prep = await api<PrepareResponse>("/api/uploads", {
        method: "POST",
        json: {
          filename: item.file.name,
          size: item.file.size,
          photographer,
          categoryId,
          activityId: activityId || null,
          takenAt: taken.date?.toISOString() ?? null,
          takenAtSource: taken.source,
          thumbnailSize: derived.thumbnail?.size ?? 0,
          previewSize: derived.preview?.size ?? 0,
          placeholder: derived.placeholder,
        },
        signal: ctrl.signal,
      });
      uploadId = prep.id;

      update(item.key, { state: "uploading" });
      const onProgress = (loaded: number) => update(item.key, { progress: loaded / item.file.size });
      // L'original est envoyé tel quel (mêmes octets, même nom), directement au stockage.
      if (prep.driver === "blob") {
        await sendToBlob(prep.id, "original", prep.storageKey, item.file, prep.contentType, ctrl.signal, onProgress);
        if (prep.thumbnailKey && derived.thumbnail) {
          await sendToBlob(prep.id, "thumbnail", prep.thumbnailKey, derived.thumbnail, "image/jpeg", ctrl.signal).catch(
            () => {},
          );
        }
        if (prep.previewKey && derived.preview) {
          await sendToBlob(prep.id, "preview", prep.previewKey, derived.preview, "image/jpeg", ctrl.signal).catch(
            () => {},
          );
        }
      } else {
        await putFile(prep.uploadUrl, item.file, prep.contentType, onProgress, ctrl.signal);
        if (prep.thumbnailUrl && derived.thumbnail) {
          await putFile(prep.thumbnailUrl, derived.thumbnail, "image/jpeg", undefined, ctrl.signal).catch(() => {});
        }
        if (prep.previewUrl && derived.preview) {
          await putFile(prep.previewUrl, derived.preview, "image/jpeg", undefined, ctrl.signal).catch(() => {});
        }
      }

      update(item.key, { state: "verifying", progress: 1 });
      await api(`/api/uploads/${prep.id}/complete`, { method: "POST" });
      update(item.key, { state: "done" });
    } catch (err) {
      const aborted = (err as DOMException)?.name === "AbortError";
      if (uploadId) {
        // Nettoyage : pas de fichier partiel ni d'enregistrement orphelin.
        await api(`/api/uploads/${uploadId}`, { method: "DELETE" }).catch(() => {});
      }
      update(item.key, aborted ? { state: "cancelled" } : { state: "error", error: (err as Error).message });
    } finally {
      controllers.current.delete(item.key);
    }
  }

  async function start() {
    if (!photographer.trim() || !categoryId) return;
    try {
      localStorage.setItem(PHOTOGRAPHER_KEY, photographer.trim());
    } catch {
      /* ignoré */
    }
    setRunning(true);
    cancelled.current.clear();
    const queue = items.filter((i) => i.state === "queued" || i.state === "error");
    let next = 0;
    const worker = async () => {
      while (next < queue.length) {
        const item = queue[next++];
        if (controllers.current.has(item.key) || cancelled.current.has(item.key)) continue;
        await uploadOne(item);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    setRunning(false);
  }

  function cancel(key: string) {
    const ctrl = controllers.current.get(key);
    cancelled.current.add(key);
    if (ctrl) ctrl.abort();
    else update(key, { state: "cancelled" });
  }

  function cancelAll() {
    items.forEach((it) => cancelled.current.add(it.key));
    setItems((prev) => prev.map((it) => (it.state === "queued" ? { ...it, state: "cancelled" } : it)));
    controllers.current.forEach((c) => c.abort());
  }

  const pending = items.filter((i) => i.state === "queued" || i.state === "error").length;
  const doneCount = items.filter((i) => i.state === "done").length;
  const canStart = !running && pending > 0 && photographer.trim() !== "" && categoryId !== "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Importer des photos et vidéos</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Les fichiers sont conservés dans leur format d&apos;origine, sans compression ni conversion. Les nouveaux
          médias ont le statut « À TRIER ».
        </p>
      </div>

      <section className="grid gap-4 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="label" htmlFor="photographer">
            Photographe *
          </label>
          <input
            id="photographer"
            className="input"
            value={photographer}
            maxLength={120}
            onChange={(e) => setPhotographer(e.target.value)}
            placeholder="Prénom Nom"
            disabled={running}
          />
        </div>
        <div>
          <label className="label" htmlFor="category">
            Catégorie *
          </label>
          <select
            id="category"
            className="input"
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setActivityId("");
            }}
            disabled={running}
          >
            <option value="">Choisir…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="activity">
            Activité
          </label>
          <select
            id="activity"
            className="input"
            value={activityId}
            onChange={(e) => setActivityId(e.target.value)}
            disabled={running || !category || category.activities.length === 0}
          >
            <option value="">
              {category && category.activities.length === 0 ? "Aucune activité pour cette catégorie" : "Aucune"}
            </option>
            {category?.activities.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="taken-date">
            Date de la prise de vue
          </label>
          <input
            id="taken-date"
            type="date"
            className="input"
            value={manualDate}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setManualDate(e.target.value)}
            disabled={running}
          />
          <p className="mt-1 text-xs text-neutral-500">
            {manualDate
              ? "Appliquée à tous les fichiers de cet import."
              : "Vide : date lue automatiquement dans chaque fichier."}
          </p>
        </div>
      </section>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition sm:p-10 ${dragOver ? "border-crf bg-crf/5" : "border-neutral-300 bg-white hover:border-neutral-400"}`}
      >
        <p className="font-medium">
          <span className="sm:hidden">Touchez pour choisir des photos ou vidéos</span>
          <span className="hidden sm:inline">Glissez-déposez vos fichiers ici</span>
        </p>
        <p className="mt-1 text-sm text-neutral-500">
          <span className="sm:hidden">Galerie, fichiers ou appareil photo — plusieurs à la fois</span>
          <span className="hidden sm:inline">ou cliquez pour les sélectionner (sélection multiple possible)</span>
        </p>
        <p className="mt-3 text-xs text-neutral-400">
          Photos : JPG, PNG, HEIC/HEIF, WEBP, GIF, AVIF, TIFF — Vidéos : MP4, MOV, M4V, WEBM, MKV, AVI, 3GP
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          className="hidden"
          data-testid="file-input"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {rejected.length > 0 && (
        <p role="alert" className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          Format non pris en charge, fichier(s) ignoré(s) : {rejected.join(", ")}
        </p>
      )}

      {items.length > 0 && (
        <section className="flex flex-col rounded-xl border border-neutral-200 bg-white">
          <div className="sticky bottom-0 z-10 order-last flex flex-wrap items-center justify-between gap-3 rounded-b-xl border-t border-neutral-200 bg-white/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:static sm:order-none sm:rounded-none sm:border-b sm:border-t-0 sm:bg-white sm:p-4">
            <p className="text-sm text-neutral-600">
              {items.length} fichier(s) — {doneCount} importé(s)
            </p>
            <div className="flex w-full gap-2 sm:w-auto">
              {!running && (
                <button
                  className="btn-secondary flex-1 sm:flex-none"
                  onClick={() => setItems((prev) => prev.filter((i) => i.state !== "done" && i.state !== "cancelled"))}
                >
                  <span className="sm:hidden">Vider</span>
                  <span className="hidden sm:inline">Retirer les terminés</span>
                </button>
              )}
              {running && (
                <button className="btn-secondary flex-1 sm:flex-none" onClick={cancelAll}>
                  Tout annuler
                </button>
              )}
              <button className="btn-primary flex-[2] sm:flex-none" disabled={!canStart} onClick={start}>
                {running ? "Import en cours…" : pending > 0 ? `Importer ${pending} fichier(s)` : "Importer"}
              </button>
            </div>
          </div>
          {(!photographer.trim() || !categoryId) && pending > 0 && (
            <p className="px-4 pt-3 text-sm text-amber-700 sm:pb-0">Renseignez le photographe et la catégorie pour lancer l&apos;import.</p>
          )}
          <ul className="divide-y divide-neutral-100">
            {items.map((it) => (
              <li key={it.key} className="flex items-center gap-3 px-4 py-3 text-sm sm:gap-4" data-state={it.state}>
                <span className="hidden w-14 shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-center text-xs uppercase text-neutral-600 sm:block">
                  {it.kind === "video" ? "Vidéo" : "Photo"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    <span className="mr-1 sm:hidden" aria-hidden>
                      {it.kind === "video" ? "🎬" : "📷"}
                    </span>
                    {it.file.name}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {formatBytes(it.file.size)}
                    {it.takenAt !== undefined &&
                      ` — prise de vue : ${
                        !it.takenAt
                          ? "inconnue"
                          : it.takenAtSource === "manual"
                            ? `${it.takenAt.toLocaleDateString("fr-FR")} (saisie)`
                            : it.takenAt.toLocaleString("fr-FR")
                      }${it.takenAtSource === "file" ? " (date du fichier)" : ""}`}
                  </p>
                  {(it.state === "uploading" || it.state === "verifying") && (
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded bg-neutral-100">
                      <div className="h-full bg-crf transition-all" style={{ width: `${Math.round(it.progress * 100)}%` }} />
                    </div>
                  )}
                  {it.error && <p className="mt-1 text-xs text-red-700">{it.error}</p>}
                </div>
                <span
                  className={`w-20 shrink-0 text-right text-xs sm:w-28 ${it.state === "done" ? "text-green-700" : it.state === "error" ? "text-red-700" : "text-neutral-500"}`}
                >
                  {STATE_LABEL[it.state]}
                  {it.state === "uploading" && ` ${Math.round(it.progress * 100)} %`}
                </span>
                {["queued", "analyzing", "uploading"].includes(it.state) ? (
                  <button
                    className="-m-2 p-2 text-xs text-neutral-500 hover:text-red-700"
                    onClick={() => cancel(it.key)}
                    aria-label={`Annuler ${it.file.name}`}
                  >
                    <span className="sm:hidden">✕</span>
                    <span className="hidden sm:inline">Annuler</span>
                  </button>
                ) : (
                  <span className="w-4 sm:w-12" />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
