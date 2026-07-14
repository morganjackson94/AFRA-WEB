import { ingestScreeningResult, type ManyChatScreeningPayload } from "../../../../lib/manychat";
import { prisma } from "../../../../lib/prisma";

// ManyChat's flow "External Request" step lands completed screenings here.
// Auth is a shared secret (ManyChat lets you add a custom header on that step),
// not a signature scheme — there's no ManyChat-side signing to verify against.
//
// Requires MANYCHAT_WEBHOOK_SECRET in env. Unset => the route stays disabled
// (503), same "won't silently pretend to work" pattern as the Stripe webhook.

function isValidPayload(body: unknown): body is ManyChatScreeningPayload {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (typeof b.locationId !== "string" || !b.locationId) return false;
  if (b.outcome !== "passed" && b.outcome !== "failed") return false;
  if (b.roleId !== undefined && typeof b.roleId !== "string") return false;
  if (b.contact !== undefined && typeof b.contact !== "string") return false;
  if (b.name !== undefined && typeof b.name !== "string") return false;
  if (b.availability !== undefined && typeof b.availability !== "string") return false;
  if (b.subscriberId !== undefined && typeof b.subscriberId !== "string") return false;
  if (b.answers !== undefined && (typeof b.answers !== "object" || b.answers === null)) return false;
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
