"use client";

import { useState } from "react";
import { api } from "@/lib/client/api";
import { ConfirmDialog } from "./ConfirmDialog";
import { useTaxonomy } from "./useTaxonomy";

type Target = { kind: "categories" | "activities"; id: string; name: string };

export function TaxonomyManager() {
  const { categories, error: loadError, reload } = useTaxonomy(true);
  const [newCategory, setNewCategory] = useState("");
  const [newActivity, setNewActivity] = useState<Record<string, string>>({});
  const [renaming, setRenaming] = useState<(Target & { value: string }) | null>(null);
  const [toDelete, setToDelete] = useState<Target | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  const patch = (t: Pick<Target, "kind" | "id">, body: object) =>
    run(() => api(`/api/admin/${t.kind}/${t.id}`, { method: "PATCH", json: body }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Catégories & activités</h1>
        <p className="text-sm text-neutral-500">
          Un élément utilisé par des médias ne peut pas être supprimé : désactivez-le pour qu&apos;il ne soit plus proposé à
          l&apos;import.
        </p>
      </div>

      {(error || loadError) && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {error || loadError}
        </p>
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            await api("/api/admin/categories", { method: "POST", json: { name: newCategory } });
            setNewCategory("");
          });
        }}
      >
        <input
          className="input sm:max-w-sm"
          placeholder="Nouvelle catégorie"
          value={newCategory}
          maxLength={80}
          onChange={(e) => setNewCategory(e.target.value)}
        />
        <button className="btn-primary shrink-0" disabled={busy || !newCategory.trim()}>
          Ajouter<span className="hidden sm:inline"> la catégorie</span>
        </button>
      </form>

      <div className="grid gap-4 md:grid-cols-2">
        {categories.map((c) => (
          <section
            key={c.id}
            data-testid="category"
            className={`rounded-xl border bg-white p-4 ${c.isActive ? "border-neutral-200" : "border-dashed border-neutral-300 opacity-70"}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              {renaming?.id === c.id ? (
                <RenameForm
                  value={renaming.value}
                  onChange={(value) => setRenaming({ ...renaming, value })}
                  onCancel={() => setRenaming(null)}
                  onSave={() => patch(renaming, { name: renaming.value }).then(() => setRenaming(null))}
                />
              ) : (
                <h2 className="min-w-0 flex-1 basis-full font-semibold sm:basis-auto">
                  {c.name}
                  <span className="ml-2 text-xs font-normal text-neutral-500">{c.mediaCount} média(s)</span>
                  {!c.isActive && <span className="ml-2 text-xs font-normal text-amber-700">désactivée</span>}
                </h2>
              )}
              <div className="-ml-2 flex gap-1 text-sm sm:ml-0 sm:text-xs">
                <button className="rounded px-2 py-2 hover:bg-neutral-100 sm:py-1" onClick={() => setRenaming({ kind: "categories", id: c.id, name: c.name, value: c.name })}>
                  Renommer
                </button>
                <button className="rounded px-2 py-2 hover:bg-neutral-100 sm:py-1" onClick={() => patch({ kind: "categories", id: c.id }, { isActive: !c.isActive })}>
                  {c.isActive ? "Désactiver" : "Réactiver"}
                </button>
                <button className="rounded px-2 py-2 text-red-700 hover:bg-red-50 sm:py-1" onClick={() => setToDelete({ kind: "categories", id: c.id, name: c.name })}>
                  Supprimer
                </button>
              </div>
            </div>

            <ul className="mt-3 space-y-1">
              {c.activities.length === 0 && <li className="text-sm text-neutral-400">Aucune activité</li>}
              {c.activities.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-x-1 gap-y-0 rounded px-2 py-1 text-sm hover:bg-neutral-50 sm:gap-2">
                  {renaming?.id === a.id ? (
                    <RenameForm
                      value={renaming.value}
                      onChange={(value) => setRenaming({ ...renaming, value })}
                      onCancel={() => setRenaming(null)}
                      onSave={() => patch(renaming, { name: renaming.value }).then(() => setRenaming(null))}
                    />
                  ) : (
                    <span className={`min-w-0 flex-1 basis-full sm:basis-auto ${a.isActive ? "" : "text-neutral-400 line-through"}`}>
                      {a.name} <span className="text-xs text-neutral-400">({a.mediaCount})</span>
                    </span>
                  )}
                  <button className="px-1 py-2 text-xs text-neutral-600 hover:underline sm:py-0" onClick={() => setRenaming({ kind: "activities", id: a.id, name: a.name, value: a.name })}>
                    Renommer
                  </button>
                  <button className="px-1 py-2 text-xs text-neutral-600 hover:underline sm:py-0" onClick={() => patch({ kind: "activities", id: a.id }, { isActive: !a.isActive })}>
                    {a.isActive ? "Désactiver" : "Réactiver"}
                  </button>
                  <button className="px-1 py-2 text-xs text-red-700 hover:underline sm:py-0" onClick={() => setToDelete({ kind: "activities", id: a.id, name: a.name })}>
                    Supprimer
                  </button>
                </li>
              ))}
            </ul>

            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await api("/api/admin/activities", {
                    method: "POST",
                    json: { categoryId: c.id, name: newActivity[c.id] ?? "" },
                  });
                  setNewActivity((p) => ({ ...p, [c.id]: "" }));
                });
              }}
            >
              <input
                className="input"
                placeholder="Nouvelle activité"
                maxLength={80}
                value={newActivity[c.id] ?? ""}
                onChange={(e) => setNewActivity((p) => ({ ...p, [c.id]: e.target.value }))}
              />
              <button className="btn-secondary" disabled={busy || !(newActivity[c.id] ?? "").trim()}>
                Ajouter
              </button>
            </form>
          </section>
        ))}
      </div>

      <ConfirmDialog
        open={toDelete !== null}
        title="Supprimer"
        message={`Supprimer « ${toDelete?.name ?? ""} » ? Cette action est irréversible.`}
        confirmLabel="Supprimer"
        danger
        busy={busy}
        onCancel={() => setToDelete(null)}
        onConfirm={() =>
          toDelete &&
          run(() => api(`/api/admin/${toDelete.kind}/${toDelete.id}`, { method: "DELETE" })).then(() => setToDelete(null))
        }
      />
    </div>
  );
}

function RenameForm({
  value,
  onChange,
  onSave,
  onCancel,
}: {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <form
      className="flex flex-1 gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <input className="input py-1" value={value} maxLength={80} onChange={(e) => onChange(e.target.value)} autoFocus />
      <button className="btn-primary py-1">OK</button>
      <button type="button" className="btn-secondary py-1" onClick={onCancel}>
        ✕
      </button>
    </form>
  );
}
