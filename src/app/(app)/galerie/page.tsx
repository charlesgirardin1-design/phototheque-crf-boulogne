import { MediaLibrary } from "@/components/MediaLibrary";
import { currentRole } from "@/lib/server/session";

export default async function GalleryPage() {
  const role = (await currentRole()) ?? "user";
  return <MediaLibrary role={role} />;
}
