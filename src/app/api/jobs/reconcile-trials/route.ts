import { honorGuarantee, scheduleTrialEndForCandidateCap } from "../../../../lib/activation";
import { FREE_CANDIDATE_CAP, getBillingProvider } from "../../../../lib/billing";
import { prisma } from "../../../../lib/prisma";

// Reconciliation backstop for the candidate-cap trial trigger (see
// FREE_CANDIDATE_CAP, billing.ts). ingestScreeningResult (manychat.ts) already
// calls scheduleTrialEndForCandidateCap synchronously the moment an operator
// crosses the cap — this job exists only to catch the case where that call
// throws (network blip, Stripe rate limit) before trial_end was moved or the
// notice email was claimed. Idempotent: the target trial_end is derived from
// the stored trialCapReachedAt, never "now", so re-running it sets the same
// date (or, if the notice window has already passed, ends the trial now), and
// the notice email has its own once-only claim.
//
// It also runs the 30-day guarantee (see GUARANTEE_DAYS, billing.ts): every
// trialing operator past guaranteeEndsAt who never reached the cap gets the
// $149 refunded and the subscription canceled (honorGuarantee, activation.ts).
// The cap reconciliation runs FIRST, so an operator whose cap crossing just
// failed to sync is handled as a cap, never refunded by mistake.
//
// Same shared-secret pattern as /api/jobs/run-scheduled-emails.

function checkSecret(request: Request): Response | null {
  const adminSecret = process.env.JOBS_ADMIN_SECRET;
  const cronSecret = process.env.CRON_SECRET;
  if (!adminSecret && !cronSecret) {
    return Response.json({ error: "reconcile-trials job not configured" }, { status: 503 });
  }

  const viaAdminHeader = adminSecret && request.headers.get("x-admin-secret") === adminSecret;
  const viaCronBearer = cronSecret && request.headers.get("authorization") === `Bearer ${cronSecret}`;
  if (!viaAdminHeader && !viaCronBearer) {
    return Response.json({ error: "invalid secret" }, { status: 401 });
  }
  return null;
}

/** Vercel Cron sends a GET request — see vercel.json. */
export async function GET(request: Request): Promise<Response> {
  return runJob(request);
}

/** Manual/curl trigger. */
export async function POST(request: Request): Promise<Response> {
  return runJob(request);
}

async function runJob(request: Request): Promise<Response> {
  const denied = checkSecret(request);
  if (denied) return denied;

  const stuck = await prisma.operator.findMany({
    where: {
      plan: "founding_annual",
      billingStatus: "trialing",
      screenedCandidateCount: { gte: FREE_CANDIDATE_CAP },
      trialEndedAt: null,
      OR: [{ trialEndsAt: null }, { trialEndNoticeEmailSentAt: null }],
    },
    select: { id: true },
  });

  const billing = getBillingProvider();
  let reconciled = 0;
  const errors: string[] = [];

  for (const { id } of stuck) {
    try {
      await scheduleTrialEndForCandidateCap(prisma, billing, id);
      reconciled++;
    } catch (err) {
      console.error(`[reconcile-trials] failed to end trial for operator ${id}:`, err);
      errors.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const guaranteeDue = await prisma.operator.findMany({
    where: {
      plan: "founding_annual",
      billingStatus: "trialing",
      guaranteeEndsAt: { lte: new Date() },
      guaranteeRefundedAt: null,
      trialCapReachedAt: null,
      screenedCandidateCount: { lt: FREE_CANDIDATE_CAP },
    },
    select: { id: true },
  });
  let refunded = 0;
  for (const { id } of guaranteeDue) {
    try {
      const outcome = await honorGuarantee(prisma, billing, id);
      if (outcome.honored) refunded++;
    } catch (err) {
      console.error(`[reconcile-trials] guarantee refund failed for operator ${id}:`, err);
      errors.push(`guarantee ${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return Response.json({
    ok: true,
    found: stuck.length,
    reconciled,
    guarantee: { due: guaranteeDue.length, refunded },
    errors,
  });
}
