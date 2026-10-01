import { redirect } from "next/navigation";
import { currentRole } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/** Contrôle serveur : l'espace administrateur n'est jamais rendu pour un autre rôle. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if ((await currentRole()) !== "admin") redirect("/galerie");
  return <>{children}</>;
}
