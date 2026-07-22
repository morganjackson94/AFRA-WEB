import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { normalizeEmail } from "./constants";
import { isRestrictedJurisdiction } from "./jurisdiction";

// Progressive-save for the onboarding wizard (see OnboardingDraft in
// schema.prisma). Deliberately a resilience mirror, not the source of truth
// for the live submission — the wizard still submits its full accumulated
// client state at the final step, same as before this redesign. This just
// means an abandoned session isn't a total loss.

export type DraftAnswers = Record<string, unknown>;

/** Upsert the draft for this email, then re-run the same jurisdiction
 *  hard-gate startOnboardingAction enforces at final submit — just invoked
 *  earlier (step 2 of the wizard) so a restricted operator finds out before
 *  answering several more questions, not only at the very end. Always call
 *  server-side; never trust a client-only check (same doctrine as
 *  isRestrictedJurisdiction itself — see jurisdiction.ts). */
export async function saveDraft(
  prisma: PrismaClient,
  rawEmail: string,
  step: number,
  answers: DraftAnswers,
): Promise<{ restricted: boolean }> {
  if (!rawEmail || !rawEmail.includes("@")) return { restricted: false };
  const email = normalizeEmail(rawEmail);

  const json = answers as Prisma.InputJsonValue;
  await prisma.onboardingDraft.upsert({
    where: { email },
    create: { email, step, answers: json },
    update: { step, answers: json },
  });

  const primaryState = typeof answers.primaryState === "string" ? answers.primaryState : "";
  const hasNycLocation = answers.hasNycLocation === true;
  const restricted = primaryState ? isRestrictedJurisdiction([primaryState], hasNycLocation) : false;
  return { restricted };
}

/** Look up a draft by email for resume-on-mount. No auth needed — same trust
 *  level as Lead capture (pre-purchase, low-stakes). */
export async function loadDraft(
  prisma: PrismaClient,
  rawEmail: string,
): Promise<{ step: number; answers: DraftAnswers } | null> {
  if (!rawEmail || !rawEmail.includes("@")) return null;
  const draft = await prisma.onboardingDraft.findUnique({ where: { email: normalizeEmail(rawEmail) } });
  if (!draft) return null;
  return { step: draft.step, answers: draft.answers as DraftAnswers };
}

/** Called once provision() successfully turns a draft into a real Operator —
 *  the draft has served its purpose. */
export async function deleteDraft(prisma: PrismaClient, rawEmail: string): Promise<void> {
  await prisma.onboardingDraft.deleteMany({ where: { email: normalizeEmail(rawEmail) } });
}
