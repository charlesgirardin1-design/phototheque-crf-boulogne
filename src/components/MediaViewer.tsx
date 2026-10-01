"use client";

import { useEffect, useRef, useState } from "react";
import type { MediaItem } from "@/lib/server/media";
import { formatBytes, STATUS_LABELS } from "@/lib/media-types";
import type { Taxonomy } from "./useTaxonomy";

const SOURCE_LABEL: Record<string, string> = {
  exif: "EXIF",
  video: "métadonnées vidéo",
  file: "date du fichier",
  manual: "saisie manuelle",
  none: "",
};

export function MediaViewer({
  item,
  isAdmin,
  categories,
  onClose,
  onPrev,
  onNext,
  onToggleStatus,
  onDelete,
  onSaveMeta,
}: {
  item: MediaItem | null;
  isAdmin: boolean;
  categories: Taxonomy;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onToggleStatus: (item: MediaItem) => void;
  onDelete: (item: MediaItem) => void;
  onSaveMeta: (
    item: MediaItem,
    meta: { photographer: string; categoryId: string; activityId: string | null },
  ) => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ photographer: "", categoryId: "", activityId: "" });
  const [saving, setSaving] = useState(false);
  const [mediaError, setMediaError] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (item && !d.open) d.showModal();
    if (!item && d.open) d.close();
  }, [item]);

  const [shownId, setShownId] = useState<string | null>(null);
  const touchX = useRef<number | null>(null);
  if (item && item.id !== shownId) {
    setShownId(item.id);
    setEditing(false);
    setMediaError(false);
    setForm({ photographer: item.photographer, categoryId: item.categoryId ?? "", activityId: item.activityId ?? "" });
  }

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (editing) return;
      if (e.key === "ArrowLeft") onPrev?.();
      if (e.key === "ArrowRight") onNext?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item, editing, onPrev, onNext]);

  const cat = categories.find((c) => c.id === form.categoryId);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-0 h-dvh max-h-none w-screen max-w-none p-0 backdrop:bg-black/70 sm:m-auto sm:h-[95vh] sm:max-h-[95vh] sm:w-[95vw] sm:max-w-6xl sm:rounded-xl sm:shadow-2xl"
    >
      {item && (
        <div className="flex h-full flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          <div
            className="relative flex h-[55dvh] shrink-0 items-center justify-center bg-neutral-900 pt-[env(safe-area-inset-top)] lg:h-auto lg:min-h-0 lg:flex-1 lg:shrink"
            onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
            onTouchEnd={(e) => {
              const start = touchX.current;
              touchX.current = null;
              if (start === null || editing) return;
              const dx = e.changedTouches[0].clientX - start;
              if (dx > 60) onPrev?.();
              if (dx < -60) onNext?.();
            }}
          >
            <button
              onClick={onClose}
              aria-label="Fermer l'aperçu"
              className="absolute right-3 top-[calc(0.75rem+env(safe-area-inset-top))] z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-lg text-white lg:hidden"
            >
              ✕
            </button>
            {mediaError ? (
              <p className="p-6 text-center text-sm text-neutral-300">
                Aperçu indisponible dans ce navigateur pour ce format. Téléchargez l&apos;original pour le consulter.
              </p>
            ) : item.mediaType === "video" ? (
              <video
                key={item.id}
                src={item.viewUrl}
                controls
                playsInline
                className="max-h-full max-w-full"
                onError={() => setMediaError(true)}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- URL signée externe, pas d'optimisation voulue
              <img
                key={item.id}
                src={item.viewUrl}
                alt={item.filename}
                className="max-h-full max-w-full object-contain"
                onError={() => setMediaError(true)}
              />
            )}
            {onPrev && (
              <button
                onClick={onPrev}
                aria-label="Précédent"
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-white hover:bg-black/70"
              >
                ‹
              </button>
            )}
            {onNext && (
              <button
                onClick={onNext}
                aria-label="Suivant"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-3 py-2 text-white hover:bg-black/70"
              >
                ›
              </button>
            )}
          </div>
          <aside className="w-full shrink-0 border-t border-neutral-200 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-sm sm:p-5 lg:w-80 lg:overflow-y-auto lg:border-l lg:border-t-0">
            <div className="flex items-start justify-between gap-2">
              <h2 className="break-all font-semibold">{item.filename}</h2>
              <button onClick={onClose} className="hidden text-neutral-500 hover:text-neutral-900 lg:block" aria-label="Fermer">
                ✕
              </button>
            </div>
            {!item.viewIsOriginal && (
              <p className="mt-2 text-xs text-neutral-500">Aperçu basse définition — l&apos;original est intact.</p>
            )}

            {!editing ? (
              <dl className="mt-4 space-y-2">
                <Row label="Type" value={`${item.mediaType === "video" ? "Vidéo" : "Photo"} (${item.mimeType})`} />
                <Row label="Taille" value={formatBytes(item.size)} />
                <Row
                  label="Prise de vue"
                  value={
                    item.takenAt
                      ? `${new Date(item.takenAt).toLocaleString("fr-FR")}${SOURCE_LABEL[item.takenAtSource] ? ` (${SOURCE_LABEL[item.takenAtSource]})` : ""}`
                      : "Inconnue"
                  }
                />
                <Row label="Importé le" value={new Date(item.uploadedAt).toLocaleString("fr-FR")} />
                <Row label="Photographe" value={item.photographer} />
                <Row label="Catégorie" value={item.categoryName ?? "—"} />
                <Row label="Activité" value={item.activityName ?? "—"} />
                {isAdmin && <Row label="Statut" value={STATUS_LABELS[item.status]} />}
                <Row label="Identifiant" value={item.id} mono />
              </dl>
            ) : (
              <form
                className="mt-4 space-y-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setSaving(true);
                  try {
                    await onSaveMeta(item, {
                      photographer: form.photographer,
                      categoryId: form.categoryId,
                      activityId: form.activityId || null,
                    });
                    setEditing(false);
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                <div>
                  <label className="label">Photographe</label>
                  <input
                    className="input"
                    value={form.photographer}
                    maxLength={120}
                    onChange={(e) => setForm({ ...form, photographer: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="label">Catégorie</label>
                  <select
                    className="input"
                    value={form.categoryId}
                    onChange={(e) => setForm({ ...form, categoryId: e.target.value, activityId: "" })}
                    required
                  >
                    <option value="">Choisir…</option>
                    {categories
                      .filter((c) => c.isActive || c.id === form.categoryId)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="label">Activité</label>
                  <select
                    className="input"
                    value={form.activityId}
                    onChange={(e) => setForm({ ...form, activityId: e.target.value })}
                  >
                    <option value="">Aucune</option>
                    {cat?.activities
                      .filter((a) => a.isActive)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="btn-primary" disabled={saving}>
                    Enregistrer
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>
                    Annuler
                  </button>
                </div>
              </form>
            )}

            <div className="mt-6 flex flex-col gap-2">
              <a href={`/api/media/${item.id}/download`} className="btn-primary">
                Télécharger l&apos;original
              </a>
              {isAdmin && !editing && (
                <>
                  <button className="btn-secondary" onClick={() => onToggleStatus(item)}>
                    {item.status === "A_TRIER" ? "Marquer « TRIÉE »" : "Remettre « À TRIER »"}
                  </button>
                  <button className="btn-secondary" onClick={() => setEditing(true)}>
                    Modifier les informations
                  </button>
                  <button className="btn-danger" onClick={() => onDelete(item)}>
                    Supprimer
                  </button>
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </dialog>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className={mono ? "break-all font-mono text-xs" : ""}>{value}</dd>
    </div>
  );
}
