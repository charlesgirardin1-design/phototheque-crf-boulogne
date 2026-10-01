"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/client/api";

const USER_LINKS: { href: string; label: string; short?: string }[] = [
  { href: "/importer", label: "Importer" },
];
const ADMIN_LINKS: { href: string; label: string; short?: string }[] = [
  { href: "/admin", label: "Tableau de bord", short: "Accueil" },
  { href: "/admin/medias", label: "Médias" },
  { href: "/admin/categories", label: "Catégories & activités", short: "Catégories" },
  { href: "/importer", label: "Importer" },
];

export function AppHeader({ role }: { role: "user" | "admin" }) {
  const pathname = usePathname();
  const links = role === "admin" ? ADMIN_LINKS : USER_LINKS;

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.replace("/"); // rechargement complet : purge l'état client
  }

  return (
    <header className="border-b border-neutral-200 bg-white pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 sm:py-3">
        <Link
          href={role === "admin" ? "/admin" : "/importer"}
          className="flex min-w-0 flex-1 items-center gap-2 font-semibold sm:flex-none"
        >
          <span aria-hidden className="relative block h-5 w-5 shrink-0">
            <span className="absolute left-1/2 top-0 h-full w-1.5 -translate-x-1/2 bg-crf" />
            <span className="absolute left-0 top-1/2 h-1.5 w-full -translate-y-1/2 bg-crf" />
          </span>
          <span className="truncate">
            Photothèque<span className="hidden sm:inline"> CRF Boulogne</span>
          </span>
        </Link>
        <div className="flex items-center gap-3 sm:order-last">
          <span className="hidden rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600 sm:inline">
            {role === "admin" ? "Administrateur" : "Utilisateur"}
          </span>
          <button onClick={logout} className="btn-secondary px-2.5 sm:px-3">
            Déconnexion
          </button>
        </div>
        <nav className={`no-scrollbar -mx-4 ${links.length === 1 ? "hidden sm:flex" : "flex"} w-full gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:w-auto sm:flex-1 sm:overflow-visible sm:px-0 sm:pb-0`}>
          {links.map((l) => {
            const active = l.href === "/admin" ? pathname === "/admin" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-sm sm:py-1.5 ${active ? "bg-crf/10 font-medium text-crf" : "text-neutral-600 hover:bg-neutral-100"}`}
              >
                {l.short ? (
                  <>
                    <span className="sm:hidden">{l.short}</span>
                    <span className="hidden sm:inline">{l.label}</span>
                  </>
                ) : (
                  l.label
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
