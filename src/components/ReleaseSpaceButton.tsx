"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { downloadAsZip } from "@/lib/client/zip";
import { formatBytes } from "@/lib/media-types";
import { ConfirmDialog } from "./ConfirmDialog";

type Sorted = { ids: string[]; bytes: number };

/**
 * Récupère les médias « TRIÉE » dans une archive ZIP (originaux intacts), puis, après
 * confirmation que l'archive est bien enregistrée, les supprime du site pour libérer l'espace.
 */
export function ReleaseSpaceButton() {
  const router = useRouter();
  const [sorted, setSorted] = useState<Sorted | null>(null);
  const [step, setStep] = useState<"idle" | "zipping" | "confirm" | "deleting">("idle");
  const [progress, setProgress] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api<Sorted>("/api/admin/media/ids")
      .then(setSorted)
      .catch(() => setSorted({ ids: [], bytes: 0 }));
  }, []);

  const count = sorted?.ids.length ?? 0;

  async function start() {
    if (!sorted || count === 0) return;
    setMessage(null);
    setStep("zipping");
    setProgress("Préparation de l'archive…");
    try {
      const res = await downloadAsZip(sorted.ids, (done, total) => setProgress(`Archive : ${done}/${total} fichiers`));
      setStep(res.cancelled ? "idle" : "confirm");
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Échec de l'archive" });
      setStep("idle");
    } finally {
      setProgress("");
    }
  }

  async function release() {
    if (!sorted) return;
    setStep("deleting");
    try {
      const res = await api<{ deleted: number }>("/api/admin/media", { method: "DELETE", json: { ids: sorted.ids } });
      setMessage({ ok: true, text: `${res.deleted} média(s) supprimé(s) du site, ${formatBytes(sorted.bytes)} libérés.` });
      setSorted({ ids: [], bytes: 0 });
      router.refresh();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Échec de la suppression" });
    } finally {
      setStep("idle");
    }
  }

  return (
    <div className="mt-4 border-t border-neutral-100 pt-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-neutral-600">
          {sorted === null
            ? "…"
            : count === 0
              ? "Aucun média « TRIÉE » à récupérer pour le moment."
              : `${count} média(s) « TRIÉE » (${formatBytes(sorted.bytes)}) peuvent être récupérés puis retirés du site.`}
        </p>
        <button className="btn-primary shrink-0" onClick={start} disabled={count === 0 || step !== "idle"}>
          {step === "zipping" ? progress || "Archive en cours…" : "Récupérer les triées et libérer l'espace"}
        </button>
      </div>
      {count === 500 && (
        <p className="mt-1 text-xs text-neutral-500">Par lots de 500 : relancez après ce lot pour les suivants.</p>
      )}
      {message && (
        <p role="status" className={`mt-2 text-sm ${message.ok ? "text-green-700" : "text-red-700"}`}>
          {message.text}
        </p>
      )}
      <ConfirmDialog
        open={step === "confirm" || step === "deleting"}
        title="Archive enregistrée ?"
        message={`Vérifiez que l'archive ZIP (${count} média(s)) est bien enregistrée sur votre appareil. Ces médias vont ensuite être supprimés définitivement du site. Cette action est irréversible.`}
        confirmLabel={`Oui, supprimer ${count} média(s) du site`}
        danger
        busy={step === "deleting"}
        onCancel={() => setStep("idle")}
        onConfirm={release}
      />
    </div>
  );
}
