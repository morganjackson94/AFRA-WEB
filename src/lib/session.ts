import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { prisma } from "./prisma";
import { hashToken } from "./auth";

const COOKIE = "tta_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Real session: the cookie holds an opaque random token; only its hash is
// persisted (see Session model). Replaces the old "cookie = raw operatorId"
// scheme, which let anyone set tta_operator=<any id> and view any operator's
// dashboard — that hole is closed by resolving ONLY from a verified session.
//
// `explicit` (the ?operator= query param some routes accept) is kept for
// bookmarkable/internal links, but it is NEVER trusted on its own — it must
// match the operatorId the session already resolved to. A mismatch means
// "not authorized for that operator", not "switch to that operator".
export async function resolveOperatorId(explicit?: string): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!session || session.expiresAt < new Date()) return null;

  if (explicit && explicit !== session.operatorId) return null;
  return session.operatorId;
}

/** Create a real session for an operator and set the cookie. Used right after
 *  onboarding (pay -> account) and after a magic-link is verified. */
export async function createSession(operatorId: string): Promise<void> {
  const raw = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({ data: { operatorId, tokenHash: hashToken(raw), expiresAt } });

  const jar = await cookies();
  jar.set(COOKIE, raw, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
  });
}

/** End the current session (logout). Deletes the DB row, not just the cookie,
 *  so a copied cookie can't keep working after logout. */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } }).catch(() => {});
  }
  jar.delete(COOKIE);
}

/** Base URL for building external-facing links (hiring link / QR / magic link). */
export function appBaseUrl(): string {
  return process.env.APP_BASE_URL ?? "http://localhost:3000";
}
