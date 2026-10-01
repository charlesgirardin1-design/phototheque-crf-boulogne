import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/token";

/**
 * Première barrière pour les PAGES : redirige vers la connexion sans session valide,
 * et refuse l'espace /admin aux non-administrateurs.
 * Les routes /api vérifient elles-mêmes le rôle (requireRole) : c'est la protection réelle.
 */
export async function proxy(req: NextRequest) {
  const secret = process.env.AUTH_SECRET ?? "";
  const role = secret.length >= 32 ? await verifySession(req.cookies.get(SESSION_COOKIE)?.value, secret) : null;
  const { pathname } = req.nextUrl;

  if (pathname === "/") {
    if (role) return NextResponse.redirect(new URL(role === "admin" ? "/admin" : "/galerie", req.url));
    return NextResponse.next();
  }
  if (!role) return NextResponse.redirect(new URL("/", req.url));
  if (pathname.startsWith("/admin") && role !== "admin") {
    return NextResponse.redirect(new URL("/galerie", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/galerie/:path*", "/importer/:path*", "/admin/:path*"],
};
