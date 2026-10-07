import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { requireDevDatabase } from "./lib/guardDatabase";
import { confirmFoundingPayment, applyStripeStatus, scheduleTrialEndForCandidateCap, sendTrialCapWarningOnce } from "../src/lib/activation";
import {
  FakeBillingProvider,
  FREE_CANDIDATE_CAP,
  getBillingProvider,
  TRIAL_CAP_NOTICE_HOURS,
  TRIAL_CAP_WARNING_AT,
} from "../src/lib/billing";
import { ingestScreeningResult } from "../src/lib/manychat";
import { provision } from "../src/lib/provision";
import { startFoundingCheckout } from "../src/lib/activation";

// Proves the candidate-counter wiring in ingestScreeningResult (manychat.ts):
// each candidate that reaches "screened" increments Operator.
// screenedCandidateCount exactly once, even under simulated duplicate
// ManyChat webhook delivery (the SAME candidate re-ingested), and crossing
// TRIAL_CAP_WARNING_AT claims the heads-up email exactly once, and crossing
// FREE_CANDIDATE_CAP moves trial_end to TRIAL_CAP_NOTICE_HOURS out (observed
// via the fake billing provider) and claims the trial-end notice exactly once
// — never ending the trial on the spot, never re-scheduling on retry, never
// extending a trial whose 60-day backstop comes sooner.

// Same pattern as checkin-job-smoke.ts: the jobs route needs a secret to run.
process.env.JOBS_ADMIN_SECRET ??= "smoke-test-secret";

let prisma: PrismaClient;
const billing = getBillingProvider();

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function main() {
  prisma = await requireDevDatabase();

  const email = "founder@trialcountersmoke.com";
  await prisma.operator.deleteMany({ where: { email } });

  const { operator } = await provision(
    prisma,
    { instagramHandle: "@trialcountersmoke", role: { title: "Barista" }, calendarChoice: "google", operatorEmail: email },
    { startTrial: false },
  );
  const locationId = operator.locations[0].id;

  // Get the operator into a real "trialing" state with a subscription id, the
  // same way a real signup does, so scheduleTrialEndForCandidateCap has something to
  // act on.
  const checkout = await startFoundingCheckout(prisma, billing, operator.id, {
    successUrl: "http://localhost:3000/dashboard?checkout=success",
    cancelUrl: "http://localhost:3000/onboarding?canceled=1",
  });
  const subscriptionId = `sub_test_${operator.id}`;
  await confirmFoundingPayment(prisma, billing, operator.id, {
    customerId: `cus_test_${operator.id}`,
    subscriptionId,
    checkoutSessionId: checkout.sessionId,
    livemode: false,
  });

  const ingest = async (i: number) => {
    const result = await ingestScreeningResult(prisma, { locationId, contact: `@candidate${i}`, outcome: "passed" });
    if (!result.ok) throw new Error(`ingest failed at candidate ${i}: ${result.error}`);
  };
  const load = () => prisma.operator.findUniqueOrThrow({ where: { id: operator.id } });

  console.log(`1) Ingesting ${TRIAL_CAP_WARNING_AT - 1}, then the ${TRIAL_CAP_WARNING_AT}th screened candidate:`);
  for (let i = 1; i < TRIAL_CAP_WARNING_AT; i++) await ingest(i);
  let op = await load();
  assert(op.trialCapWarningEmailSentAt === null, `no heads-up at ${TRIAL_CAP_WARNING_AT - 1}`);
  await ingest(TRIAL_CAP_WARNING_AT);
  op = await load();
  const warnedAt = op.trialCapWarningEmailSentAt;
  assert(warnedAt !== null, `heads-up claimed at ${TRIAL_CAP_WARNING_AT}`);

  console.log(`\n2) Up to ${FREE_CANDIDATE_CAP - 1}: the heads-up is not re-sent, nothing scheduled yet:`);
  for (let i = TRIAL_CAP_WARNING_AT + 1; i < FREE_CANDIDATE_CAP; i++) await ingest(i);
  op = await load();
  assert(op.trialCapWarningEmailSentAt?.getTime() === warnedAt?.getTime(), "heads-up claim unchanged (sent once)");
  assert(op.trialCapReachedAt === null && op.trialEndsAt === null, "no trial-end scheduled before the cap");

  console.log(`\n3) The ${FREE_CANDIDATE_CAP}th candidate moves trial_end ${TRIAL_CAP_NOTICE_HOURS}h out instead of ending the trial:`);
  await ingest(FREE_CANDIDATE_CAP);
  op = await load();
  assert(op.screenedCandidateCount === FREE_CANDIDATE_CAP, `screenedCandidateCount is exactly ${FREE_CANDIDATE_CAP}`);
  assert(op.trialCapReachedAt !== null, "trialCapReachedAt claimed");
  const expectedEnd = op.trialCapReachedAt!.getTime() + TRIAL_CAP_NOTICE_HOURS * 3600 * 1000;
  assert(Math.abs(op.trialEndsAt!.getTime() - expectedEnd) < 1000, `trialEndsAt = trialCapReachedAt + ${TRIAL_CAP_NOTICE_HOURS}h`);
  const subStatus = await billing.getSubscriptionStatus(subscriptionId);
  assert(subStatus.stripeStatus === "trialing", "the subscription is still trialing (no charge yet)");
  assert(subStatus.trialEnd === Math.floor(expectedEnd / 1000), "Stripe-side trial_end set to the same moment");
  assert(op.trialEndNoticeEmailSentAt !== null, "trial-end notice claimed");
  assert(op.billingStatus === "trialing", "billingStatus untouched until the trial actually ends");

  console.log("\n4) Retries (ingest redelivery, reconcile job) re-schedule nothing and send nothing:");
  const noticeAt = op.trialEndNoticeEmailSentAt;
  const retry = await scheduleTrialEndForCandidateCap(prisma, billing, operator.id);
  assert(retry.scheduled && retry.action === "unchanged", "second call leaves trial_end alone");
  assert(retry.scheduled && retry.notice.sent === false && retry.notice.reason === "already-sent", "notice not re-sent");
  op = await load();
  assert(Math.abs(op.trialEndsAt!.getTime() - expectedEnd) < 1000, "trialEndsAt unchanged (not pushed later)");
  assert(op.trialEndNoticeEmailSentAt?.getTime() === noticeAt?.getTime(), "notice claim unchanged");

  console.log("\n5) trial_end arrives: Stripe ends the trial, the webhook closes the loop:");
  if (billing instanceof FakeBillingProvider) billing.setStatusForTest(subscriptionId, "active");
  await applyStripeStatus(prisma, billing, operator.id);
  op = await load();
  assert(op.billingStatus === "active", "billingStatus flips to 'active' once the resulting webhook is processed");
  assert(op.trialEndedAt !== null, "trialEndedAt stamped");

  // Edge cases on throwaway operators.
  const edgeOperator = async (tag: string) => {
    const email = `founder+${tag}@trialcountersmoke.com`;
    await prisma.operator.deleteMany({ where: { email } });
    const { operator: o } = await provision(
      prisma,
      { instagramHandle: `@tcs${tag}`, role: { title: "Barista" }, calendarChoice: "google", operatorEmail: email },
      { startTrial: false },
    );
    const co = await startFoundingCheckout(prisma, billing, o.id, {
      successUrl: "http://localhost:3000/dashboard?checkout=success",
      cancelUrl: "http://localhost:3000/onboarding?canceled=1",
    });
    const sub = `sub_test_${o.id}`;
    await confirmFoundingPayment(prisma, billing, o.id, {
      customerId: `cus_test_${o.id}`,
      subscriptionId: sub,
      checkoutSessionId: co.sessionId,
      livemode: false,
    });
    return { id: o.id, sub };
  };

  console.log("\n6) The 60-day backstop comes sooner than cap + 72h: never extended, and no repeat of the 7-day email:");
  const soon = await edgeOperator("soon");
  const backstop = Math.floor(Date.now() / 1000) + 24 * 3600;
  if (billing instanceof FakeBillingProvider) billing.setTrialEndForTest(soon.sub, backstop);
  await prisma.operator.update({ where: { id: soon.id }, data: { screenedCandidateCount: FREE_CANDIDATE_CAP, trialEndingSoonEmailSentAt: new Date() } });
  const soonRes = await scheduleTrialEndForCandidateCap(prisma, billing, soon.id);
  assert(soonRes.scheduled && soonRes.action === "unchanged", "trial_end left at the sooner backstop");
  assert(soonRes.scheduled && soonRes.trialEndsAt.getTime() === backstop * 1000, "trialEndsAt records the backstop");
  assert(soonRes.scheduled && !soonRes.notice.sent && soonRes.notice.reason === "covered-by-trial-ending-soon", "notice skipped: the 7-day email already gave this date");
  await prisma.operator.delete({ where: { id: soon.id } });

  console.log("\n7) Reconcile catching a failure after the 72h window: ends now, no stale notice:");
  const late = await edgeOperator("late");
  await prisma.operator.update({
    where: { id: late.id },
    data: { screenedCandidateCount: FREE_CANDIDATE_CAP, trialCapReachedAt: new Date(Date.now() - 4 * 24 * 3600 * 1000) },
  });
  const lateRes = await scheduleTrialEndForCandidateCap(prisma, billing, late.id);
  assert(lateRes.scheduled && lateRes.action === "ended-now", "trial ended now instead of setting a past trial_end");
  assert(lateRes.scheduled && !lateRes.notice.sent && lateRes.notice.reason === "not-eligible", "no 'ends in 3 days' email for a trial already ending");
  await prisma.operator.delete({ where: { id: late.id } });

  console.log("\n8) No stale heads-up after the cap: an operator already past 20 never gets 'you're at 15':");
  const past = await edgeOperator("past");
  await prisma.operator.update({ where: { id: past.id }, data: { screenedCandidateCount: FREE_CANDIDATE_CAP, trialCapReachedAt: new Date() } });
  const pastWarn = await sendTrialCapWarningOnce(prisma, past.id);
  assert(!pastWarn.sent && pastWarn.reason === "not-eligible", "heads-up refused once the cap is reached");
  await prisma.operator.delete({ where: { id: past.id } });

  console.log("\n8b) The 7-day 'trial ending soon' job skips an operator who already reached the cap:");
  const capped = await edgeOperator("capped7d");
  const uncapped = await edgeOperator("uncapped7d");
  const day55 = new Date(Date.now() - 55 * 24 * 3600 * 1000);
  await prisma.operator.update({ where: { id: capped.id }, data: { createdAt: day55, screenedCandidateCount: FREE_CANDIDATE_CAP, trialCapReachedAt: new Date() } });
  await prisma.operator.update({ where: { id: uncapped.id }, data: { createdAt: day55 } });
  const { POST } = await import("../src/app/api/jobs/run-scheduled-emails/route");
  const jobRes = await POST(new Request("http://localhost:3000/api/jobs/run-scheduled-emails", {
    method: "POST",
    headers: { "x-admin-secret": process.env.JOBS_ADMIN_SECRET! },
  }));
  assert(jobRes.status === 200, "scheduled-emails job ran");
  const cappedAfter = await prisma.operator.findUniqueOrThrow({ where: { id: capped.id } });
  const uncappedAfter = await prisma.operator.findUniqueOrThrow({ where: { id: uncapped.id } });
  assert(cappedAfter.trialEndingSoonEmailSentAt === null, "capped operator: no 7-day email (it would carry the stale day-60 date)");
  assert(uncappedAfter.trialEndingSoonEmailSentAt !== null, "uncapped operator at day 55: 7-day email claimed as before");
  await prisma.operator.deleteMany({ where: { id: { in: [capped.id, uncapped.id] } } });

  console.log("\n9) Duplicate delivery: re-ingesting an ALREADY-counted candidate must not double-count:");
  const beforeCount = op.screenedCandidateCount;
  const dup = await ingestScreeningResult(prisma, {
    locationId,
    contact: "@candidate1", // already ingested above, already countedTowardTrial
    outcome: "passed",
  });
  if (!dup.ok) throw new Error(`duplicate ingest failed: ${dup.error}`);
  op = await prisma.operator.findUniqueOrThrow({ where: { id: operator.id } });
  assert(op.screenedCandidateCount === beforeCount, "screenedCandidateCount unchanged on re-ingest of the same candidate");

  console.log("\n10) A candidate who fails screening never counts:");
  const rejected = await ingestScreeningResult(prisma, {
    locationId,
    contact: "@rejectedcandidate",
    outcome: "failed",
  });
  if (!rejected.ok) throw new Error(`rejected ingest failed: ${rejected.error}`);
  op = await prisma.operator.findUniqueOrThrow({ where: { id: operator.id } });
  assert(op.screenedCandidateCount === beforeCount, "screenedCandidateCount unchanged by a rejected candidate");
  const rejectedCandidate = await prisma.candidate.findFirstOrThrow({ where: { locationId, contact: "@rejectedcandidate" } });
  assert(rejectedCandidate.countedTowardTrial === false, "rejected candidate's countedTowardTrial stays false");

  await prisma.operator.delete({ where: { id: operator.id } });
  console.log("\nTrial counter smoke test PASSED.");
}

main()
  .catch((e) => {
    console.error("\n" + e.message);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
