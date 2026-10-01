import { assertSameOrigin, handler } from "@/lib/server/http";
import { endSession } from "@/lib/server/session";

export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  await endSession();
  return Response.json({ ok: true });
});
