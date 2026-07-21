import { ingestScreeningResult, type ManyChatScreeningPayload } from "../../../../lib/manychat";
import { prisma } from "../../../../lib/prisma";

// ManyChat's flow "External Request" step lands completed screenings here.
// Auth is a shared secret (ManyChat lets you add a custom header on that step),
// not a signature scheme — there's no ManyChat-side signing to verify against.
//
// Requires MANYCHAT_WEBHOOK_SECRET in env. Unset => the route stays disabled
// (503), same "won't silently pretend to work" pattern as the Stripe webhook.

// Exported for scripts/knockout-smoke.ts — Next.js only treats the uppercase
// HTTP-verb exports (GET/POST/etc.) and a few reserved config names
// specially, so an extra named export here is inert for routing purposes.
export function isValidPayload(body: unknown): body is ManyChatScreeningPayload {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (typeof b.locationId !== "string" || !b.locationId) return false;
  // outcome is optional (computed server-side when absent — see manychat.ts),
  // but reject it outright if present-and-invalid.
  if (b.outcome !== undefined && b.outcome !== "passed" && b.outcome !== "failed") return false;
  if (b.roleId !== undefined && typeof b.roleId !== "string") return false;
  if (b.contact !== undefined && typeof b.contact !== "string") return false;
  if (b.name !== undefined && typeof b.name !== "string") return false;
  if (b.availability !== undefined && typeof b.availability !== "string") return false;
  if (b.subscriberId !== undefined && typeof b.subscriberId !== "string") return false;
  if (b.answers !== undefined && (typeof b.answers !== "object" || b.answers === null)) return false;
  // At least one of outcome/answers must be present — otherwise there's
  // nothing to score and nothing to trust.
  if (b.outcome === undefined && b.answers === undefined) return false;
  return true;
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.MANYCHAT_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json({ error: "manychat bridge not configured" }, { status: 503 });
  }

  const provided = request.headers.get("x-manychat-secret");
  if (provided !== secret) {
    return Response.json({ error: "invalid secret" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (!isValidPayload(body)) {
    return Response.json({ error: "malformed payload" }, { status: 400 });
  }

  const result = await ingestScreeningResult(prisma, body);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 422 });
  }

  return Response.json({ received: true, candidateId: result.candidateId, stage: result.stage });
}
