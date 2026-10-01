"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/client/api";

const USER_LINKS = [
  { href: "/galerie", label: "Photothèque" },
  { href: "/importer", label: "Importer" },
];
const ADMIN_LINKS = [
  { href: "/admin", label: "Tableau de bord" },
  { href: "/admin/medias", label: "Médias" },
  { href: "/admin/categories", label: "Catégories & activités" },
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
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href={role === "admin" ? "/admin" : "/galerie"} className="flex items-center gap-2 font-semibold">
          <span aria-hidden className="relative block h-5 w-5">
            <span className="absolute left-1/2 top-0 h-full w-1.5 -translate-x-1/2 bg-crf" />
            <span className="absolute left-0 top-1/2 h-1.5 w-full -translate-y-1/2 bg-crf" />
          </span>
          Photothèque CRF Boulogne
        </Link>
        <nav className="flex flex-1 flex-wrap gap-1">
          {links.map((l) => {
            const active = l.href === "/admin" ? pathname === "/admin" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-md px-3 py-1.5 text-sm ${active ? "bg-crf/10 font-medium text-crf" : "text-neutral-600 hover:bg-neutral-100"}`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600">
            {role === "admin" ? "Administrateur" : "Utilisateur"}
          </span>
          <button onClick={logout} className="btn-secondary">
            Déconnexion
          </button>
        </div>
      </div>
    </header>
  );
}
