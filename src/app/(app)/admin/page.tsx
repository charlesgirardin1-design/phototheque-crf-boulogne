import Link from "next/link";
import { getStats } from "@/lib/server/stats";
import { formatBytes } from "@/lib/media-types";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const stats = await getStats();
  const cards = [
    { label: "Médias", value: stats.total, href: "/admin/medias" },
    { label: "À TRIER", value: stats.toSort, href: "/admin/medias?status=A_TRIER", accent: true },
    { label: "TRIÉE", value: stats.sorted, href: "/admin/medias?status=TRIEE" },
    { label: "Photos", value: stats.photos },
    { label: "Vidéos", value: stats.videos },
    { label: "Espace utilisé", value: formatBytes(stats.bytes) },
  ];
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Tableau de bord</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => {
          const body = (
            <div
              className={`rounded-xl border bg-white p-4 ${c.accent && stats.toSort > 0 ? "border-amber-300" : "border-neutral-200"}`}
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
