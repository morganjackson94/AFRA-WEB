import { applyStripeStatus } from "../../../../lib/activation";
import { createLoginToken } from "../../../../lib/auth";
import {
  getBillingProvider,
  RENEWAL_NOTICE_DAYS_BEFORE,
  TRIAL_DAYS_BACKSTOP,
  TRIAL_ENDING_SOON_DAYS_BEFORE,
  trialBackstopDate,
} from "../../../../lib/billing";
import { sendCheckinEmail, sendRenewalNoticeEmail, sendTrialEndingSoonEmail } from "../../../../lib/mail";
import { prisma } from "../../../../lib/prisma";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Duplicated from session.ts's appBaseUrl() rather than imported: session.ts
// pulls in next/headers (cookies()), which breaks when this route module is
// imported directly by plain-tsx smoke scripts (checkin-job-smoke.ts) running
// outside the Next.js request runtime — same reasoning as activation.ts's own
// duplicate of this function.
function appBaseUrl(): string {
  return process.env.APP_BASE_URL ?? "http://localhost:3000";
}

// Day-20 check-in job. Finds every operator whose 20-day fuse (checkinEmailDueAt,
// set at checkout confirmation — see activation.ts's confirmFoundingPayment)
// has passed, sends the check-in email once, and stamps checkinEmailSentAt.
// Safe to run repeatedly: each operator is claimed atomically (updateMany
// guarded on checkinEmailSentAt still being null) BEFORE its send, same
// idiom as every other lifecycle email in activation.ts, so re-running this
// job (cron overlap, manual retry) can never double-send.
//
// billingStatus in ("trialing", "active"): under the trial model (see
// FREE_CANDIDATE_CAP/TRIAL_DAYS_BACKSTOP, billing.ts), day 20 lands almost
// always WHILE still trialing (the trial runs up to 60 days) — that's
// exactly when this personal how's-it-going touch is most useful, so
// "trialing" must be included, not just "active". Excludes canceled/
// past_due/trial_pending, since there's no point checking in on an operator
// who never started or already left.
//
// Protected by a shared secret. Two ways in, both optional and independent:
//   - X-Admin-Secret: <JOBS_ADMIN_SECRET> — same pattern as the ManyChat admin
//     routes, for the manual curl command (see .env.example / the report).
//   - Authorization: Bearer <CRON_SECRET> — Vercel Cron's own standard
//     mechanism: Vercel automatically sends this header on every cron
//     invocation when a CRON_SECRET env var is set, with no custom header
//     config needed on the vercel.json side. See vercel.json's crons entry.
// Either one alone is sufficient. There's no admin UI/auth yet, same as the
// other founder-only routes.

function checkSecret(request: Request): Response | null {
  const adminSecret = process.env.JOBS_ADMIN_SECRET;
  const cronSecret = process.env.CRON_SECRET;
  if (!adminSecret && !cronSecret) {
    return Response.json({ error: "scheduled-emails job not configured" }, { status: 503 });
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

/** Manual/curl trigger — see the report for the exact command. */
export async function POST(request: Request): Promise<Response> {
  return runJob(request);
}

async function runJob(request: Request): Promise<Response> {
  const denied = checkSecret(request);
  if (denied) return denied;

  const due = await prisma.operator.findMany({
    where: {
      checkinEmailDueAt: { lte: new Date() },
      checkinEmailSentAt: null,
      billingStatus: { in: ["trialing", "active"] },
    },
    select: { id: true },
  });

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const { id } of due) {
    const claim = await prisma.operator.updateMany({
      where: { id, checkinEmailSentAt: null },
      data: { checkinEmailSentAt: new Date() },
    });
    if (claim.count === 0) {
      skipped++;
      continue;
    }

    try {
      const operator = await prisma.operator.findUniqueOrThrow({ where: { id } });
      const token = await createLoginToken(prisma, id);
      const dashboardUrl = `${appBaseUrl()}/login/verify?token=${token}`;
      const result = await sendCheckinEmail({ to: operator.email, dashboardUrl });
      if (result.sent) {
        sent++;
      } else {
        errors.push(`${id}: send did not complete (stub=${result.stub ?? false})`);
      }
    } catch (err) {
      console.error(`[checkin-email] failed for operator ${id}:`, err);
      errors.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const trialEndingSoon = await runTrialEndingSoonJob();
  const renewalNotice = await runRenewalNoticeJob();

  return Response.json({
    ok: true,
    checkin: { eligible: due.length, sent, skipped, errors },
    trialEndingSoon,
    renewalNotice,
  });
}

// Trial-ending-soon job. TRIAL_ENDING_SOON_DAYS_BEFORE days before the
// trial's 60-day backstop (see billing.ts's trialBackstopDate — the SAME
// derivation describeBilling uses for dashboard display, so there's one
// source of truth for the trial-end date, not two that can drift).
//
// billingStatus: "trialing" does the real work of handling both edge cases
// where the 7-day date should never fire a warning:
//   - trial ends early via the candidate cap: endTrialForCandidateCap's
//     resulting webhook flips billingStatus away from "trialing" before (or
//     regardless of) whether 7 days remained — this operator is no longer
//     in the eligible set, deliberately, not by omission. There's nothing
//     "coming up" to warn about once the trial has already ended.
//   - operator cancels before the email fires: cancelBilling sets
//     billingStatus to "canceled", same exclusion, same reasoning — don't
//     warn about a charge that will never happen.
// An operator with fewer than TRIAL_ENDING_SOON_DAYS_BEFORE days left "for
// any reason" (a missed cron run, a delayed deploy) is still caught by the
// `createdAt <= cutoff` comparison (it's `<=`, not `===`) — daysRemaining is
// computed fresh per-operator at send time, not hardcoded to 7, so the copy
// stays accurate even when the job runs late.
async function runTrialEndingSoonJob() {
  const cutoff = new Date(Date.now() - (TRIAL_DAYS_BACKSTOP - TRIAL_ENDING_SOON_DAYS_BEFORE) * ONE_DAY_MS);
  const due = await prisma.operator.findMany({
    where: {
      plan: "founding_annual",
      billingStatus: "trialing",
      createdAt: { lte: cutoff },
      trialEndingSoonEmailSentAt: null,
    },
    select: { id: true },
  });

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const { id } of due) {
    // Claimed before send, same idiom as checkinEmailSentAt above — a second
    // invocation the same day (cron overlap, manual retry) matches zero rows
    // here and skips, never double-sending.
    const claim = await prisma.operator.updateMany({
      where: { id, trialEndingSoonEmailSentAt: null },
      data: { trialEndingSoonEmailSentAt: new Date() },
    });
    if (claim.count === 0) {
      skipped++;
      continue;
    }

    try {
      const operator = await prisma.operator.findUniqueOrThrow({ where: { id } });
      const endDate = trialBackstopDate(operator.createdAt);
      const daysRemaining = Math.max(1, Math.ceil((endDate.getTime() - Date.now()) / ONE_DAY_MS));
      const trialEndDate = endDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      const token = await createLoginToken(prisma, id);
      const dashboardUrl = `${appBaseUrl()}/login/verify?token=${token}`;
      const result = await sendTrialEndingSoonEmail({ to: operator.email, dashboardUrl, trialEndDate, daysRemaining });
      if (result.sent) {
        sent++;
      } else {
        errors.push(`${id}: send did not complete (stub=${result.stub ?? false})`);
      }
    } catch (err) {
      console.error(`[trial-ending-soon-email] failed for operator ${id}:`, err);
      errors.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { eligible: due.length, sent, skipped, errors };
}

// Annual renewal notice, RENEWAL_NOTICE_DAYS_BEFORE days before each automatic
// renewal. subscriptionRenewsAt is synced from Stripe by applyStripeStatus
// (every subscription webhook and invoice.paid), so after a renewal it moves a
// year out and the operator becomes eligible again next year; the claim stores
// WHICH renewal date was noticed, giving one notice per renewal.
// Active operators missing subscriptionRenewsAt (paid before this column
// existed) are synced from Stripe first so they aren't silently skipped.
async function runRenewalNoticeJob() {
  const billing = getBillingProvider();
  // The offline fake has no real subscription state to sync from.
  const unsynced = billing.mode === "fake" ? [] : await prisma.operator.findMany({
    where: {
      plan: "founding_annual",
      billingStatus: "active",
      subscriptionCancelAt: null,
      subscriptionRenewsAt: null,
      stripeSubscriptionId: { not: null },
    },
    select: { id: true },
  });
  const errors: string[] = [];
  for (const { id } of unsynced) {
    try {
      await applyStripeStatus(prisma, billing, id);
    } catch (err) {
      errors.push(`${id}: sync failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const now = new Date();
  const windowEnd = new Date(now.getTime() + RENEWAL_NOTICE_DAYS_BEFORE * ONE_DAY_MS);
  const due = await prisma.operator.findMany({
    where: {
      plan: "founding_annual",
      billingStatus: "active",
      subscriptionCancelAt: null,
      subscriptionRenewsAt: { gt: now, lte: windowEnd },
    },
    select: { id: true, subscriptionRenewsAt: true, renewalNoticeSentForRenewsAt: true },
  });

  let sent = 0;
  let skipped = 0;
  const eligible = due.filter(
    (o) => o.renewalNoticeSentForRenewsAt?.getTime() !== o.subscriptionRenewsAt!.getTime(),
  );

  for (const { id, subscriptionRenewsAt } of eligible) {
    const renewsAt = subscriptionRenewsAt!;
    const claim = await prisma.operator.updateMany({
      where: {
        id,
        subscriptionRenewsAt: renewsAt,
        OR: [{ renewalNoticeSentForRenewsAt: null }, { renewalNoticeSentForRenewsAt: { not: renewsAt } }],
      },
      data: { renewalNoticeSentForRenewsAt: renewsAt },
    });
    if (claim.count === 0) {
      skipped++;
      continue;
    }

    try {
      const operator = await prisma.operator.findUniqueOrThrow({ where: { id } });
      const daysRemaining = Math.max(1, Math.ceil((renewsAt.getTime() - Date.now()) / ONE_DAY_MS));
      const renewalDate = renewsAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      const token = await createLoginToken(prisma, id);
      const dashboardUrl = `${appBaseUrl()}/login/verify?token=${token}`;
      const result = await sendRenewalNoticeEmail({ to: operator.email, dashboardUrl, renewalDate, daysRemaining });
      if (result.sent) {
        sent++;
      } else {
        errors.push(`${id}: send did not complete (stub=${result.stub ?? false})`);
      }
    } catch (err) {
      console.error(`[renewal-notice-email] failed for operator ${id}:`, err);
      errors.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { synced: unsynced.length, eligible: eligible.length, sent, skipped, errors };
}
