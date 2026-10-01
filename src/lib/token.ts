import { jwtVerify, SignJWT } from "jose";

export type Role = "user" | "admin";

export const SESSION_COOKIE = "crf_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12;

const key = (secret: string) => new TextEncoder().encode(secret);

/** Jeton de session signé (HMAC-SHA256). Il ne contient que le rôle. */
export async function signSession(role: Role, secret: string): Promise<string> {
  return new SignJWT({ role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .setAudience("phototheque-crf")
    .sign(key(secret));
}

export async function verifySession(token: string | undefined, secret: string): Promise<Role | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      algorithms: ["HS256"],
      audience: "phototheque-crf",
    });
    return payload.role === "admin" || payload.role === "user" ? payload.role : null;
  } catch {
    return null;
  }
}
