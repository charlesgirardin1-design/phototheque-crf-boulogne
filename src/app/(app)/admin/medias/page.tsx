import { MediaLibrary } from "@/components/MediaLibrary";

export default async function AdminMediaPage({ searchParams }: PageProps<"/admin/medias">) {
  const { status } = await searchParams;
  const initialStatus = status === "A_TRIER" || status === "TRIEE" ? status : undefined;
  return <MediaLibrary key={initialStatus ?? "all"} role="admin" initialStatus={initialStatus} />;
}
