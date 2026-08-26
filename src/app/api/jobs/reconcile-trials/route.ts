import { endTrialForCandidateCap } from "../../../../lib/activation";
import { FREE_CANDIDATE_CAP, getBillingProvider } from "../../../../lib/billing";
import { prisma } from "../../../../lib/prisma";

// Reconciliation backstop for the candidate-cap trial trigger (see
// FREE_CANDIDATE_CAP, billing.ts). ingestScreeningResult (manychat.ts) already
// calls endTrialForCandidateCap synchronously the moment an operator crosses
// the cap — this job exists only to catch the case where that call throws
// (network blip, Stripe rate limit) with no retry otherwise, since ending a
// trial is a real-money action worth cheap insurance on. Idempotent: calling
// endTrialForCandidateCap again for an operator whose trial already ended is
// a harmless no-op (it re-checks billingStatus === "trialing" itself).
//
// The 60-day backstop needs NO job of its own — Stripe's own
// trial_period_days already ends that trial with zero app code, firing a
// webhook straight into applyStripeStatus. This job only ever needs to act
// on the OTHER trigger, the one this app itself initiates.
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
    },
    select: { id: true },
  });

  const billing = getBillingProvider();
  let reconciled = 0;
  const errors: string[] = [];

  for (const { id } of stuck) {
    try {
      await endTrialForCandidateCap(prisma, billing, id);
      reconciled++;
    } catch (err) {
      console.error(`[reconcile-trials] failed to end trial for operator ${id}:`, err);
      errors.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return Response.json({ ok: true, found: stuck.length, reconciled, errors });
}
