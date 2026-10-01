"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client/api";
import { downloadAsZip } from "@/lib/client/zip";
import type { MediaItem } from "@/lib/server/media";
import { STATUS_LABELS, type MediaStatus } from "@/lib/media-types";
import { ConfirmDialog } from "./ConfirmDialog";
import { MediaViewer } from "./MediaViewer";
import { useTaxonomy } from "./useTaxonomy";

type Filters = {
  q: string;
  category: string;
  activity: string;
  status: "" | MediaStatus;
  type: "" | "photo" | "video";
  from: string;
  to: string;
  sort: "uploaded_at" | "taken_at" | "filename" | "size";
  order: "asc" | "desc";
};

const EMPTY: Filters = {
  q: "",
  category: "",
  activity: "",
  status: "",
  type: "",
  from: "",
  to: "",
  sort: "uploaded_at",
  order: "desc",
};

type ListResponse = { items: MediaItem[]; total: number; page: number; pageSize: number };

export function MediaLibrary({ role, initialStatus }: { role: "user" | "admin"; initialStatus?: MediaStatus }) {
  const isAdmin = role === "admin";
  const { categories } = useTaxonomy(isAdmin);
  const [filters, setFilters] = useState<Filters>({ ...EMPTY, status: initialStatus ?? "" });
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewIndex, setViewIndex] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [zipProgress, setZipProgress] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Recherche avec délai de saisie.
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.q === query ? f : { ...f, q: query }));
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) sp.set(k, v);
    sp.set("page", String(page));
    return sp.toString();
  }, [filters, page]);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- indicateur de chargement
    setLoading(true);
    api<ListResponse>(`/api/media?${queryString}`)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setError(null);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [queryString, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  const setFilter = <K extends keyof Filters>(k: K, v: Filters[K]) => {
    setFilters((f) => ({ ...f, [k]: v, ...(k === "category" ? { activity: "" } : {}) }));
    setPage(1);
  };

  const items = data?.items ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const category = categories.find((c) => c.id === filters.category);
  const selectedIds = [...selected];
  const allOnPageSelected = items.length > 0 && items.every((i) => selected.has(i.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) items.forEach((i) => next.delete(i.id));
      else items.forEach((i) => next.add(i.id));
      return next;
    });
  }

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      setNotice(await action());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  const setStatus = (ids: string[], status: MediaStatus) =>
    run(async () => {
      const res = await api<{ updated: number }>("/api/admin/media", { method: "PATCH", json: { ids, status } });
      reload();
      return `${res.updated} média(s) passé(s) au statut « ${STATUS_LABELS[status]} ».`;
    });

  const doDelete = (ids: string[]) =>
    run(async () => {
      const res = await api<{ deleted: number }>("/api/admin/media", { method: "DELETE", json: { ids } });
      setSelected((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      setConfirmDelete(null);
      setViewIndex(null);
      reload();
      return `${res.deleted} média(s) supprimé(s) définitivement.`;
    });

  const downloadSelection = () =>
    run(async () => {
      if (selectedIds.length === 1) {
        const a = document.createElement("a");
        a.href = `/api/media/${selectedIds[0]}/download`;
        a.click();
        return "Téléchargement lancé.";
      }
      setZipProgress("Préparation de l'archive…");
      try {
        const res = await downloadAsZip(selectedIds, (done, total) => setZipProgress(`Archive : ${done}/${total} fichiers`));
        return res.cancelled ? "Téléchargement annulé." : `Archive ZIP de ${res.count} fichier(s) téléchargée.`;
      } finally {
        setZipProgress(null);
      }
    });

  const viewed = viewIndex !== null ? (items[viewIndex] ?? null) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{isAdmin ? "Gestion des médias" : "Photothèque"}</h1>
          <p className="text-sm text-neutral-500">
            {data ? `${data.total} média(s)` : "Chargement…"}
            {!isAdmin && " triés et validés"}
          </p>
        </div>
      </div>

      <section className="grid gap-3 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <input
          className="input sm:col-span-2"
          placeholder="Rechercher (nom de fichier, photographe, catégorie, activité)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Rechercher"
        />
        <select className="input" value={filters.category} onChange={(e) => setFilter("category", e.target.value)} aria-label="Catégorie">
          <option value="">Toutes les catégories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={filters.activity}
          onChange={(e) => setFilter("activity", e.target.value)}
          disabled={!category || category.activities.length === 0}
          aria-label="Activité"
        >
          <option value="">Toutes les activités</option>
          {category?.activities.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select className="input" value={filters.type} onChange={(e) => setFilter("type", e.target.value as Filters["type"])} aria-label="Type">
          <option value="">Photos et vidéos</option>
          <option value="photo">Photos</option>
          <option value="video">Vidéos</option>
        </select>
        {isAdmin && (
          <select
            className="input"
            value={filters.status}
            onChange={(e) => setFilter("status", e.target.value as Filters["status"])}
            aria-label="Statut"
          >
            <option value="">Tous les statuts</option>
            <option value="A_TRIER">À TRIER</option>
            <option value="TRIEE">TRIÉE</option>
          </select>
        )}
        <div className="flex min-w-0 gap-2">
          <input type="date" className="input min-w-0" value={filters.from} onChange={(e) => setFilter("from", e.target.value)} aria-label="Du" title="Prise de vue à partir du" />
          <input type="date" className="input min-w-0" value={filters.to} onChange={(e) => setFilter("to", e.target.value)} aria-label="Au" title="Prise de vue jusqu'au" />
        </div>
        <div className="flex min-w-0 gap-2">
          <select className="input min-w-0" value={filters.sort} onChange={(e) => setFilter("sort", e.target.value as Filters["sort"])} aria-label="Trier par">
            <option value="uploaded_at">Date d&apos;import</option>
            <option value="taken_at">Date de prise de vue</option>
            <option value="filename">Nom de fichier</option>
            <option value="size">Taille</option>
          </select>
          <select className="input w-32 min-w-0" value={filters.order} onChange={(e) => setFilter("order", e.target.value as Filters["order"])} aria-label="Ordre">
            <option value="desc">Décroissant</option>
            <option value="asc">Croissant</option>
          </select>
        </div>
        <button
          className="btn-secondary"
          onClick={() => {
            setQuery("");
            setFilters({ ...EMPTY });
            setPage(1);
          }}
        >
          Réinitialiser
        </button>
      </section>

      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-white/95 p-3 backdrop-blur">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={allOnPageSelected} onChange={togglePage} className="h-4 w-4 accent-crf" />
          Tout sélectionner (page)
        </label>
        <span className="text-sm text-neutral-500">{selected.size} sélectionné(s)</span>
        {selected.size > 0 && (
          <>
            <button className="btn-secondary" onClick={() => setSelected(new Set())}>
              Désélectionner
            </button>
            <button className="btn-primary" onClick={downloadSelection} disabled={busy}>
              {selected.size > 1 ? `Télécharger (ZIP, ${selected.size})` : "Télécharger"}
            </button>
            {isAdmin && (
              <>
                <button className="btn-secondary" onClick={() => setStatus(selectedIds, "TRIEE")} disabled={busy}>
                  Marquer TRIÉE
                </button>
                <button className="btn-secondary" onClick={() => setStatus(selectedIds, "A_TRIER")} disabled={busy}>
                  Remettre À TRIER
                </button>
                <button className="btn-danger" onClick={() => setConfirmDelete(selectedIds)} disabled={busy}>
                  Supprimer ({selected.size})
                </button>
              </>
            )}
          </>
        )}
        {zipProgress && <span className="text-sm text-neutral-600">{zipProgress}</span>}
      </div>

      {notice && <p className="rounded-md bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
      {error && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}

      {loading && !data ? (
        <p className="py-12 text-center text-neutral-500">Chargement…</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 py-16 text-center text-neutral-500">
          Aucun média ne correspond à ces critères.
        </p>
      ) : (
        <ul className={`grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 ${loading ? "opacity-60" : ""}`}>
          {items.map((it, idx) => (
            <li
              key={it.id}
              data-testid="media-card"
              className={`group relative overflow-hidden rounded-lg border bg-white ${selected.has(it.id) ? "border-crf ring-2 ring-crf" : "border-neutral-200"}`}
            >
              <button className="block aspect-square w-full bg-neutral-100" onClick={() => setViewIndex(idx)} title={it.filename}>
                {it.thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- URL signée externe
                  <img src={it.thumbUrl} alt={it.filename} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-3xl text-neutral-400">
                    {it.mediaType === "video" ? "▶" : "🖼"}
                  </span>
                )}
              </button>
              <input
                type="checkbox"
                aria-label={`Sélectionner ${it.filename}`}
                checked={selected.has(it.id)}
                onChange={() => toggle(it.id)}
                className="absolute left-2 top-2 h-5 w-5 accent-crf"
              />
              {it.mediaType === "video" && (
                <span className="absolute right-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">VIDÉO</span>
              )}
              <div className="p-2 text-xs">
                <p className="truncate font-medium" title={it.filename}>
                  {it.filename}
                </p>
                <p className="truncate text-neutral-500">
                  {[it.categoryName, it.activityName].filter(Boolean).join(" · ") || "—"}
                </p>
                {isAdmin && (
                  <span
                    className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${it.status === "A_TRIER" ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}`}
                  >
                    {STATUS_LABELS[it.status]}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-3 py-4">
          <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Précédent
          </button>
          <span className="text-sm text-neutral-600">
            Page {page} / {totalPages}
          </span>
          <button className="btn-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Suivant
          </button>
        </nav>
      )}

      <MediaViewer
        item={viewed}
        isAdmin={isAdmin}
        categories={categories}
        onClose={() => setViewIndex(null)}
        onPrev={viewIndex !== null && viewIndex > 0 ? () => setViewIndex(viewIndex - 1) : undefined}
        onNext={viewIndex !== null && viewIndex < items.length - 1 ? () => setViewIndex(viewIndex + 1) : undefined}
        onToggleStatus={(it) => setStatus([it.id], it.status === "A_TRIER" ? "TRIEE" : "A_TRIER")}
        onDelete={(it) => setConfirmDelete([it.id])}
        onSaveMeta={async (it, meta) => {
          await run(async () => {
            await api(`/api/admin/media/${it.id}`, { method: "PATCH", json: meta });
            reload();
            return "Informations mises à jour.";
          });
        }}
      />

      {isAdmin && (
        <ConfirmDialog
          open={confirmDelete !== null}
          title="Suppression définitive"
          message={
            confirmDelete && confirmDelete.length > 1
              ? `Êtes-vous sûr de vouloir supprimer ${confirmDelete.length} médias ? Cette action est irréversible.`
              : "Êtes-vous sûr de vouloir supprimer ce média ? Cette action est irréversible."
          }
          confirmLabel="Supprimer définitivement"
          danger
          busy={busy}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => confirmDelete && doDelete(confirmDelete)}
        />
      )}
    </div>
  );
}
