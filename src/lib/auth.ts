import { randomBytes, createHash } from "crypto";
import type { PrismaClient } from "../generated/prisma/client";

// Magic-link token issuance/consumption. The raw token is what goes in the
// email URL; only its SHA-256 hash is ever persisted, so a DB read can't be
// replayed as a working link. Single-use (usedAt) and short-lived (15 min).

const TOKEN_TTL_MS = 15 * 60 * 1000;

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Issue a new magic-link token for an operator (by id). Returns the RAW token
 *  — caller puts it in the email URL, never stores it themselves. */
export async function createLoginToken(prisma: PrismaClient, operatorId: string): Promise<string> {
  const raw = generateToken();
  await prisma.loginToken.create({
    data: {
      operatorId,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });
  return raw;
}

export type ConsumeResult = { ok: true; operatorId: string } | { ok: false; reason: "invalid" | "expired" | "used" };

/** Consume a magic-link token exactly once. Expired/used/unknown tokens are all
 *  treated as failures without revealing which (avoids leaking token validity). */
export async function consumeLoginToken(prisma: PrismaClient, raw: string): Promise<ConsumeResult> {
  const tokenHash = hashToken(raw);
  const token = await prisma.loginToken.findUnique({ where: { tokenHash } });
  if (!token) return { ok: false, reason: "invalid" };
  if (token.usedAt) return { ok: false, reason: "used" };
  if (token.expiresAt < new Date()) return { ok: false, reason: "expired" };

  // Mark used inside a guard so a race can't consume the same token twice.
  const updated = await prisma.loginToken.updateMany({
    where: { id: token.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (updated.count === 0) return { ok: false, reason: "used" };

  return { ok: true, operatorId: token.operatorId };
}
