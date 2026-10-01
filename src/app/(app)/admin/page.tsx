import Link from "next/link";
import { getStats } from "@/lib/server/stats";
import { formatBytes } from "@/lib/media-types";
import { ReleaseSpaceButton } from "@/components/ReleaseSpaceButton";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const stats = await getStats();
  // Espace réellement utilisable : 95 % du quota (même marge que le contrôle à l'import).
  const usable = Math.floor(stats.quotaBytes * 0.95);
  const free = Math.max(0, usable - stats.bytes);
  const pct = Math.min(100, (stats.bytes / stats.quotaBytes) * 100);
  const level = stats.bytes >= usable ? "full" : pct >= 80 ? "warn" : "ok";
  const cards = [
    { label: "Médias", value: stats.total, href: "/admin/medias" },
    { label: "À TRIER", value: stats.toSort, href: "/admin/medias?status=A_TRIER", accent: true },
    { label: "TRIÉE", value: stats.sorted, href: "/admin/medias?status=TRIEE" },
    { label: "Photos", value: stats.photos },
    { label: "Vidéos", value: stats.videos },
    { label: "Espace disponible", value: formatBytes(free), warn: level !== "ok" },
  ];
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Tableau de bord</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => {
          const body = (
            <div
              className={`rounded-xl border bg-white p-4 ${(c.accent && stats.toSort > 0) || c.warn ? "border-amber-300" : "border-neutral-200"}`}
            >
              <p className="text-xs uppercase tracking-wide text-neutral-500">{c.label}</p>
              <p className="mt-1 text-xl font-semibold sm:text-2xl">{c.value}</p>
            </div>
          );
          return c.href ? (
            <Link key={c.label} href={c.href} className="hover:opacity-80">
              {body}
            </Link>
          ) : (
            <div key={c.label}>{body}</div>
          );
        })}
      </div>
      <section
        className={`rounded-xl border bg-white p-4 ${level === "full" ? "border-red-300" : level === "warn" ? "border-amber-300" : "border-neutral-200"}`}
      >
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="font-semibold">Espace de stockage</h2>
          <p className="text-sm text-neutral-600">
            <strong className="text-neutral-900">{formatBytes(free)}</strong> disponibles sur {formatBytes(stats.quotaBytes)}
          </p>
        </div>
        <div
          className="h-3 overflow-hidden rounded-full bg-neutral-100"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          aria-label="Espace utilisé"
        >
          <div
            className={`h-full rounded-full ${level === "full" ? "bg-red-600" : level === "warn" ? "bg-amber-500" : "bg-green-600"}`}
            style={{ width: `${Math.max(pct, stats.bytes > 0 ? 1 : 0)}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          {formatBytes(stats.bytes)} utilisés ({pct.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %), originaux et
          miniatures compris. 5 % sont gardés en réserve par sécurité.
        </p>
        {level === "warn" && (
          <p className="mt-2 text-sm text-amber-800">
            Le stockage sera bientôt plein. Récupérez les médias triés ci-dessous pour libérer de la place.
          </p>
        )}
        {level === "full" && (
          <p className="mt-2 text-sm text-red-800">
            Stockage plein : les nouveaux imports sont bloqués. Récupérez les médias triés ci-dessous pour libérer de la place.
          </p>
        )}
        <ReleaseSpaceButton />
      </section>
      <section className="rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 font-semibold">Répartition par catégorie</h2>
        {stats.byCategory.length === 0 ? (
          <p className="text-sm text-neutral-500">Aucun média pour le moment.</p>
        ) : (
          <ul className="space-y-2">
            {stats.byCategory.map((c) => (
              <li key={c.name} className="flex items-center gap-3 text-sm">
                <span className="w-28 truncate sm:w-48">{c.name}</span>
                <span className="h-2 flex-1 overflow-hidden rounded bg-neutral-100">
                  <span className="block h-full bg-crf" style={{ width: `${(c.count / stats.total) * 100}%` }} />
                </span>
                <span className="w-12 text-right tabular-nums">{c.count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="grid gap-2 sm:flex sm:flex-wrap">
        <Link href="/admin/medias?status=A_TRIER" className="btn-primary">
          Trier les nouveaux médias
        </Link>
        <Link href="/importer" className="btn-secondary">
          Importer
        </Link>
        <Link href="/admin/categories" className="btn-secondary">
          Gérer les catégories
        </Link>
      </div>
    </div>
  );
}
