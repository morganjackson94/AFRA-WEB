import { createLoginToken } from "../../../../lib/auth";
import { sendCheckinEmail } from "../../../../lib/mail";
import { prisma } from "../../../../lib/prisma";

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

  return Response.json({ ok: true, eligible: due.length, sent, skipped, errors });
}
