import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { buildAssembledQuestions, evaluateDisqualification, snapshotAnswers } from "./screeningQuestions";

// ManyChat bridge — candidate ingest. ManyChat cannot create flows, but a flow's
// "External Request" step CAN POST completed-screening data out. This is that
// landing point: real Candidate + Conversation records get created/advanced
// from it, which is what makes the dashboard pipeline (Applied -> Screened ->
// Booked -> Showed) real instead of empty scaffolding.
//
// Billable-event honesty: this never touches Booking — a booking is what's
// billed, and bookings are created by the (separate, concierge-for-now)
// calendar/booking path, not by a screening result.

/** Stage order — a later webhook must never regress a candidate backward
 *  (e.g. a duplicate/out-of-order "screened" result after they're already
 *  "booked"). Only "applied" and "rejected" are ever set BACKWARD-safe here. */
export const STAGE_RANK: Record<string, number> = {
  applied: 0,
  rejected: 0, // terminal, but ranked with "applied" so a later real pass can still advance them
  screened: 1,
  booked: 2,
  showed: 3,
};

export type ManyChatScreeningPayload = {
  locationId: string;
  roleId?: string;
  subscriberId?: string;
  name?: string;
  /** IG handle or other contact reference — used to de-dupe the candidate. */
  contact?: string;
  availability?: string;
  answers?: Record<string, string>;
  /** Trusted as-is when present (backward compat with the live ManyChat flow,
   *  which still self-computes this via its own Condition node today). When
   *  absent, computed server-side from `answers` + the operator's configured
   *  disqualifiers — see evaluateDisqualification() in screeningQuestions.ts.
   *  At least one of `outcome`/`answers` must be present (enforced by the
   *  webhook route's isValidPayload) — otherwise there's nothing to score. */
  outcome?: "passed" | "failed";
};

export type IngestResult =
  | { ok: true; candidateId: string; stage: string; created: boolean }
  | { ok: false; error: string };

export async function ingestScreeningResult(
  prisma: PrismaClient,
  payload: ManyChatScreeningPayload,
): Promise<IngestResult> {
  const location = await prisma.location.findUnique({
    where: { id: payload.locationId },
    select: { id: true, operatorId: true, operator: { select: { disqualifiers: true } } },
  });
  if (!location) return { ok: false, error: "unknown locationId" };

  let roleTitle: string | undefined;
  if (payload.roleId) {
    const role = await prisma.role.findFirst({
      where: { id: payload.roleId, locationId: location.id },
      select: { id: true, title: true },
    });
    if (!role) return { ok: false, error: "roleId does not belong to locationId" };
    roleTitle = role.title;
  }

  // Distinct role titles across every one of this operator's locations —
  // drives whether the assembled flow includes the role-interest question
  // (only asked when the operator hires for more than one role).
  const operatorRoles = await prisma.role.findMany({
    where: { location: { operatorId: location.operatorId } },
    select: { title: true },
    distinct: ["title"],
  });
  const assembledSet = {
    roleTitle: roleTitle ?? "",
    questions: buildAssembledQuestions(
      roleTitle,
      location.operator.disqualifiers,
      operatorRoles.map((r) => r.title),
    ),
  };

  // Explicit outcome always wins (backward compat — see the type comment
  // above). Only computed when absent, and only computable when answers
  // exist; the webhook route already rejects payloads with neither.
  const outcome: "passed" | "failed" =
    payload.outcome ??
    (evaluateDisqualification(assembledSet, payload.answers ?? {}, location.operator.disqualifiers)
      ? "failed"
      : "passed");

  const nextStage = outcome === "passed" ? "screened" : "rejected";

  // De-dupe by (locationId, contact) when contact is given; otherwise always
  // create (no reliable key to match on).
  const existing = payload.contact
    ? await prisma.candidate.findFirst({
        where: { locationId: location.id, contact: payload.contact },
      })
    : null;

  let candidateId: string;
  let created: boolean;
  let finalStage: string;

  if (existing) {
    // Never regress an already-further-along candidate.
    const advance = (STAGE_RANK[nextStage] ?? 0) >= (STAGE_RANK[existing.stage] ?? 0);
    finalStage = advance ? nextStage : existing.stage;
    await prisma.candidate.update({
      where: { id: existing.id },
      data: {
        name: payload.name ?? existing.name,
        availability: payload.availability ?? existing.availability,
        roleId: payload.roleId ?? existing.roleId,
        stage: finalStage,
      },
    });
    candidateId = existing.id;
    created = false;
  } else {
    const candidate = await prisma.candidate.create({
      data: {
        locationId: location.id,
        roleId: payload.roleId,
        name: payload.name,
        contact: payload.contact,
        availability: payload.availability,
        stage: nextStage,
      },
    });
    candidateId = candidate.id;
    created = true;
    finalStage = nextStage;
  }

  // One Conversation per candidate for the operator (create-or-update), holding
  // the transcript ManyChat sent. Reuses the existing "open|screening|passed|
  // failed|closed" state vocabulary already on the model.
  const conversation = await prisma.conversation.findFirst({
    where: { candidateId, operatorId: location.operatorId },
  });
  // Snapshotted at ingest time (not decoded on read) so records stay readable
  // even after a future edit to SCREENING_QUESTIONS changes the live copy.
  // Uses this operator's real disqualifiers so the snapshot's "screens out"
  // flags match what actually happened, not a generic/universal-only view.
  const questionSnapshot = snapshotAnswers(assembledSet, payload.answers, location.operator.disqualifiers);
  const transcript = {
    answers: payload.answers ?? {},
    subscriberId: payload.subscriberId,
    receivedAt: new Date().toISOString(),
    ...(questionSnapshot ? { questionSnapshot } : {}),
  } satisfies Prisma.InputJsonValue;

  if (conversation) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { state: outcome === "passed" ? "passed" : "failed", transcript },
    });
  } else {
    await prisma.conversation.create({
      data: {
        candidateId,
        operatorId: location.operatorId,
        state: outcome === "passed" ? "passed" : "failed",
        transcript,
      },
    });
  }

  return { ok: true, candidateId, stage: finalStage, created };
}
