import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { buildAssembledQuestions, evaluateDisqualification, getQuestionSetForRole, snapshotAnswers } from "./screeningQuestions";

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

// --- Clean payload translation (rebuilt ManyChat master flow, 2026-07) -----
// The rebuilt flow POSTs human-readable field names with affirmative-phrased
// booleans (true = the non-disqualifying/qualifying answer, as the candidate
// hears it) instead of the internal A/B letter slugs above. This is a pure
// translation layer in front of the existing contract — qualification logic,
// slugs, and the outcome response are untouched. isCleanManyChatPayload()
// distinguishes this shape from the older internal-shaped one so the route
// can accept both without a breaking change.

export type CleanManyChatPayload = {
  locationId: string;
  work_auth: boolean | string;
  /** Role NAME (matches a Role.title at locationId), not an id — resolving
   *  it is this translator's job. Optional when the location has exactly one
   *  role (buildAssembledQuestions only asks this question for multi-role
   *  operators, so the rebuilt flow may never collect it for a single-role
   *  operator); required and must resolve when there's more than one. */
  selected_role?: string;
  /** Every ko_* field is itself optional — buildAssembledQuestions() only
   *  asks the knockouts this specific operator selected during onboarding
   *  (Operator.disqualifiers), so the rebuilt flow will only send the ones
   *  it actually asked. Absent = not evaluated (same as today). Present =
   *  must parse as affirmative/negative, or the request is rejected. */
  ko_weekends?: boolean | string;
  ko_evenings?: boolean | string;
  ko_experience?: boolean | string;
  ko_transport?: boolean | string;
  ko_opening?: boolean | string;
  ko_closing?: boolean | string;
  ko_foodcert?: boolean | string;
  ko_commitment?: boolean | string;
  comp_1?: string;
  comp_2?: string;
  comp_3?: string;
  cand_name?: string;
  cand_email?: string;
};

const CLEAN_KNOCKOUT_FIELDS: { clean: keyof CleanManyChatPayload; slug: string }[] = [
  { clean: "ko_weekends", slug: "ko_no_weekends" },
  { clean: "ko_evenings", slug: "ko_no_evenings" },
  { clean: "ko_experience", slug: "ko_under_6mo_experience" },
  { clean: "ko_transport", slug: "ko_no_transportation" },
  { clean: "ko_opening", slug: "ko_cant_open" },
  { clean: "ko_closing", slug: "ko_cant_close" },
  { clean: "ko_foodcert", slug: "ko_no_food_handler_cert" },
  { clean: "ko_commitment", slug: "ko_wont_commit_3mo" },
];

/**
 * true/"true"/"yes"/"1" -> "A"; false/"false"/"no"/"0" -> "B" (case-
 * insensitive on strings). Every knockout + work_auth question is phrased so
 * the candidate's affirmative answer is option A and the negative one is B
 * (see screeningQuestions.ts — e.g. "Are you available to work weekends?"
 * A=Yes/B=No, B is the conditionally-disqualifying letter) — checked against
 * all 9 questions individually, not assumed. That's why one uniform
 * true->A/false->B rule is correct here instead of a per-question flip, even
 * though the clean field is affirmative-phrased and the internal slug name
 * is negative-phrased (ko_weekends vs ko_no_weekends) — the slug's NAME is
 * negative, but its option A is still the affirmative/non-disqualifying one.
 * Accepts real JSON booleans and string fallbacks since it's not certain
 * which shape ManyChat's External Request step will actually serialize.
 */
function parseAffirmative(raw: unknown): "A" | "B" | undefined {
  if (typeof raw === "boolean") return raw ? "A" : "B";
  if (typeof raw === "string") {
    const v = raw.trim().toLowerCase();
    if (v === "true" || v === "yes" || v === "1") return "A";
    if (v === "false" || v === "no" || v === "0") return "B";
  }
  return undefined;
}

/** Shape check only (cheap, sync). The defining signal: `work_auth` at the
 *  top level with no `answers` object — the older internal-shaped payload
 *  always nests its work_auth answer under `answers`, never at the top. */
export function isCleanManyChatPayload(body: unknown): body is CleanManyChatPayload {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return "work_auth" in b && b.answers === undefined && typeof b.locationId === "string" && !!b.locationId;
}

export type TranslateResult =
  | { ok: true; payload: ManyChatScreeningPayload }
  | { ok: false; error: string };

/**
 * Translates the clean payload into the existing ManyChatScreeningPayload
 * shape: renames cand_name/cand_email, resolves selected_role -> Role.id
 * (exact title match scoped to locationId, with a single-role fallback when
 * it's omitted — see CleanManyChatPayload's comment; a mismatch or
 * unresolvable ambiguity is a hard 4xx, never a silent fallback to the wrong
 * competency set), converts every present knockout + work_auth boolean to
 * its internal A/B letter, and maps comp_1/2/3 onto whichever FOH/BOH
 * competency slugs match the resolved role (reusing getQuestionSetForRole so
 * this can't drift from the real question set).
 */
export async function translateCleanManyChatPayload(
  prisma: PrismaClient,
  body: CleanManyChatPayload,
): Promise<TranslateResult> {
  let role: { id: string; title: string } | null;
  if (body.selected_role && body.selected_role.trim()) {
    role = await prisma.role.findFirst({
      where: { locationId: body.locationId, title: body.selected_role },
      select: { id: true, title: true },
    });
    if (!role) {
      return { ok: false, error: `selected_role "${body.selected_role}" does not match any role at locationId ${body.locationId}` };
    }
  } else {
    const roles = await prisma.role.findMany({
      where: { locationId: body.locationId },
      select: { id: true, title: true },
    });
    if (roles.length !== 1) {
      return {
        ok: false,
        error: `selected_role is required — locationId ${body.locationId} has ${roles.length} roles configured, so it can't be inferred`,
      };
    }
    role = roles[0];
  }

  const workAuth = parseAffirmative(body.work_auth);
  if (!workAuth) {
    return { ok: false, error: `work_auth must be true/false (or "yes"/"no") — got ${JSON.stringify(body.work_auth)}` };
  }

  const answers: Record<string, string> = { work_auth: workAuth, role_select: role.title };

  for (const { clean, slug } of CLEAN_KNOCKOUT_FIELDS) {
    const raw = body[clean];
    if (raw === undefined) continue; // this operator doesn't ask this knockout — nothing to translate
    const letter = parseAffirmative(raw);
    if (!letter) {
      return { ok: false, error: `${clean} must be true/false (or "yes"/"no") — got ${JSON.stringify(raw)}` };
    }
    answers[slug] = letter;
  }

  const competencyQuestions = getQuestionSetForRole(role.title).questions;
  const compValues = [body.comp_1, body.comp_2, body.comp_3];
  for (let i = 0; i < competencyQuestions.length; i++) {
    const value = compValues[i];
    if (typeof value === "string" && value.trim()) {
      answers[competencyQuestions[i].key] = value;
    }
  }

  return {
    ok: true,
    payload: {
      locationId: body.locationId,
      roleId: role.id,
      name: body.cand_name,
      contact: body.cand_email,
      answers,
    },
  };
}

export type IngestResult =
  | { ok: true; candidateId: string; stage: string; created: boolean; outcome: "qualified" | "unqualified" }
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

  // External vocabulary for API consumers (ManyChat's condition node
  // string-matches on this) is "qualified"/"unqualified" — kept distinct from
  // the internal "passed"/"failed" used above for STAGE_RANK/Conversation.state,
  // so a future rename of either doesn't silently break the other's contract.
  return {
    ok: true,
    candidateId,
    stage: finalStage,
    created,
    outcome: outcome === "passed" ? "qualified" : "unqualified",
  };
}
