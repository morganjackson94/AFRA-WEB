import { type Prisma, type PrismaClient } from "../generated/prisma/client";

// Server-side activation events. These are the SAME events the Meta ad campaign
// optimizes on, so they must fire only on honest moments and be trustworthy
// (server-emitted, idempotent). Two types this session:
//   StartedSetup — a real signup intent: provisioning has begun.
//   WentLive     — all four readiness gates true (the genuine activation).

export type ActivationEventType = "StartedSetup" | "WentLive";

export type EmitResult = {
  /** true only the FIRST time this (operator, type) fires; false on repeats. */
  fired: boolean;
  event: { id: string; type: string; operatorId: string };
};

/**
 * Emit an activation event idempotently. The DB unique([operatorId, type])
 * guarantees one-per-operator even under races. forwardToMeta() is only called
 * when the event genuinely fires for the first time.
 */
export async function emitEvent(
  prisma: PrismaClient,
  args: { operatorId: string; type: ActivationEventType; payload?: Record<string, unknown> },
): Promise<EmitResult> {
  const where = { operatorId_type: { operatorId: args.operatorId, type: args.type } };

  const existing = await prisma.event.findUnique({ where });
  if (existing) return { fired: false, event: existing };

  let event;
  try {
    event = await prisma.event.create({
      data: {
        operatorId: args.operatorId,
        type: args.type,
        payload: (args.payload ?? {}) as Prisma.InputJsonValue,
      },
    });
  } catch {
    // Lost a race to create — someone else fired it. Treat as already fired.
    const again = await prisma.event.findUniqueOrThrow({ where });
    return { fired: false, event: again };
  }

  // Forward to Meta (stubbed seam). Mark forwarded only on accepted forward.
  const forwarded = await forwardToMeta(toMetaPayload(event.type, args.operatorId, args.payload));
  if (forwarded.success) {
    await prisma.event.update({ where: { id: event.id }, data: { metaForwarded: true } });
  }

  return { fired: true, event };
}

// --- Meta forwarding seam (STUBBED) -----------------------------------------

/** Pixel/CAPI-shaped payload. The real send needs the production page + Pixel. */
export type MetaEventPayload = {
  event_name: string;
  event_time: number; // unix seconds
  action_source: "website";
  custom_data: Record<string, unknown>;
};

export function toMetaPayload(
  type: string,
  operatorId: string,
  custom?: Record<string, unknown>,
): MetaEventPayload {
  return {
    event_name: type,
    event_time: Math.floor(Date.now() / 1000),
    action_source: "website",
    custom_data: { operatorId, ...custom },
  };
}

/**
 * STUB. Real version POSTs to the Meta Conversions API (Pixel/CAPI) — that needs
 * the production landing page + Pixel id + access token, which is not this
 * session. For now it logs intent and reports success so the seam is exercised.
 */
export async function forwardToMeta(
  payload: MetaEventPayload,
): Promise<{ success: boolean }> {
  console.log(`[forwardToMeta:STUB] would send to Meta CAPI:`, JSON.stringify(payload));
  return { success: true };
}
