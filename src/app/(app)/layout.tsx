import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { currentRole } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const role = await currentRole();
  if (!role) redirect("/");
  return (
    <div className="min-h-screen">
      <AppHeader role={role} />
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
