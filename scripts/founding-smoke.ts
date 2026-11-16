import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { requireDevDatabase } from "./lib/guardDatabase";
import {
  applyStripeStatus,
  confirmFoundingPayment,
  honorGuarantee,
  recomputeOperatorReadiness,
  scheduleTrialEndForCandidateCap,
  startFoundingCheckout,
} from "../src/lib/activation";
import { FakeBillingProvider, getBillingProvider } from "../src/lib/billing";
import { evaluateReadiness, isBillingActive } from "../src/lib/readiness";
import { connectStubbedIntegrations } from "../src/lib/testing";
import { provision } from "../src/lib/provision";

// Step proof: founding subscription = checkout with a trial (no charge at
// signup). provision -> hosted checkout -> billing flips to "trialing" ONLY
// on (simulated) webhook confirmation, via evaluateReadiness(). Abandoned
// checkout stays unpaid. Trialing != live. The trial itself ends via ONE
// shared path (applyStripeStatus) regardless of which of its two causes
// triggered it — the candidate cap (scheduleTrialEndForCandidateCap) or Stripe's own
// Stripe trial end — see steps 9-11 for the 30-day guarantee.

let prisma: PrismaClient;
const billing = getBillingProvider();

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function role(operatorId: string) {
  return prisma.role.findFirstOrThrow({ where: { location: { operatorId } } });
}

async function main() {
  prisma = await requireDevDatabase();

  console.log(`Billing provider mode: ${billing.mode}\n`);

  // ---- 1) Founding signup: provision WITHOUT a trial, then start checkout ----
  const email = "founder@annualdemo.com";
  await prisma.operator.deleteMany({ where: { email } });

  const { operatorId } = await provision(
    prisma,
    { instagramHandle: "@annualdemo", role: { title: "Barista", pay: "$18/hr" }, calendarChoice: "google", operatorEmail: email },
    { startTrial: false }, // the founding path's OWN trial is the subscription trial below, not provision()'s monthly-path trial
  );

  let op = await prisma.operator.findUniqueOrThrow({ where: { id: operatorId } });
  let r = await role(operatorId);
  console.log("1) After provision (no monthly-path trial):");
  assert(op.billingStatus === "trial_pending", "billingStatus is 'trial_pending' (unpaid)");
  assert(op.stripeSubscriptionId === null, "no subscription created yet");
  assert(r.gateBilling === false, "gateBilling FALSE before checkout (via evaluateReadiness)");

  const checkout = await startFoundingCheckout(prisma, billing, operatorId, {
    successUrl: "http://localhost:3000/dashboard?checkout=success",
    cancelUrl: "http://localhost:3000/onboarding?canceled=1",
  });
  op = await prisma.operator.findUniqueOrThrow({ where: { id: operatorId } });
  console.log(`   checkoutUrl = ${checkout.checkoutUrl.slice(0, 60)}…`);
  assert(op.plan === "founding_annual", "plan set to founding_annual");
  assert(op.stripeCheckoutSessionId === checkout.sessionId, "checkout session id persisted");
  assert(op.billingStatus === "trial_pending", "still unpaid after creating checkout (no flip yet)");

  // ---- 2) ABANDONED checkout: no webhook => stays unpaid, honest ----
  console.log("\n2) Abandoned checkout (no webhook fires):");
  r = await role(operatorId);
  assert(op.billingStatus !== "trialing", "operator exists but has NOT started trialing");
  assert(r.gateBilling === false, "gateBilling stays FALSE when checkout is abandoned");
  assert(r.readinessState !== "live", "abandoned-checkout operator is not live");

  // ---- 3) Webhook-confirmed checkout => trialing, gateBilling true via SSOT ----
  console.log("\n3) Webhook confirms checkout complete (the ONLY thing that starts the trial):");
  const subscriptionId = `sub_test_${operatorId}`;
  await confirmFoundingPayment(prisma, billing, operatorId, {
    customerId: `cus_test_${operatorId}`,
    subscriptionId,
    paymentIntentId: `pi_test_${operatorId}`,
    checkoutSessionId: checkout.sessionId,
    livemode: false,
  });
  op = await prisma.operator.findUniqueOrThrow({ where: { id: operatorId } });
  r = await role(operatorId);
  console.log(`   billingStatus=${op.billingStatus} gateBilling=${r.gateBilling} state=${r.readinessState}`);
  assert(op.billingStatus === "trialing", "billingStatus flips to 'trialing' on webhook confirmation (NOT 'active' — nothing charged yet)");
  assert(isBillingActive(op.billingStatus) === true, "isBillingActive(trialing) true (SSOT predicate)");
  assert(r.gateBilling === true, "gateBilling TRUE — derived by evaluateReadiness from billingStatus");
  assert(op.stripeSubscriptionId === subscriptionId, "subscription id persisted (needed later to end the trial)");
  assert(op.stripePaymentIntentId === `pi_test_${operatorId}`, "payment intent id stored (for manual refunds)");
  assert(op.trialEndedAt === null, "trialEndedAt still null — trial hasn't ended");

  // ---- 4) Trialing != live: channel/calendar still stubbed => still 'ready' ----
  console.log("\n4) Trialing founding operator still reads NOT live (stubs):");
  assert(r.gatePlatform === false && r.gateCalendar === false, "channel + calendar gates still FALSE (stubbed)");
  assert(r.readinessState === "ready", "readinessState is 'ready', NOT 'live' — trialing ≠ live");

  // Sanity: the gate math is the SSOT, not ad-hoc.
  const recomputed = evaluateReadiness({
    channelStatus: "stubbed",
    calendarStatus: "stubbed",
    template: { slots: { headline: "x", roleLabel: "y", payLabel: "z" } },
    billingStatus: op.billingStatus,
  });
  assert(recomputed.gateBilling === true && recomputed.readinessState === "ready", "evaluateReadiness agrees: gateBilling true, state ready");

  // ---- 5) Only after connecting stubs does it go live (trialing didn't) ----
  console.log("\n5) Connecting channel+calendar is what makes it live (not the trial):");
  await connectStubbedIntegrations(prisma, operatorId);
  const live = await recomputeOperatorReadiness(prisma, operatorId);
  r = await role(operatorId);
  assert(r.readinessState === "live", "now live after channel+calendar connected");
  assert(live.wentLiveFired === true, "WentLive fired on the real live transition (not on trial-start)");

  // ---- 6) Idempotent re-confirm (still trialing, no double-effects) ----
  const beforeWentLive = await prisma.event.count({ where: { operatorId, type: "WentLive" } });
  await confirmFoundingPayment(prisma, billing, operatorId, { livemode: false });
  const afterWentLive = await prisma.event.count({ where: { operatorId, type: "WentLive" } });
  op = await prisma.operator.findUniqueOrThrow({ where: { id: operatorId } });
  assert(beforeWentLive === afterWentLive, "re-confirming checkout does not double-fire WentLive (idempotent)");
  assert(op.billingStatus === "trialing", "re-confirming checkout does not disturb billingStatus");

  // ---- 7) Trial ends via the CANDIDATE-CAP trigger ----
  console.log("\n7) Candidate #20 crosses the cap -> scheduleTrialEndForCandidateCap moves trial_end 72h out -> Stripe ends the trial then -> webhook lands in applyStripeStatus:");
  const scheduled = await scheduleTrialEndForCandidateCap(prisma, billing, operatorId);
  assert(scheduled.scheduled && scheduled.action === "set", "the cap moved trial_end rather than ending the trial on the spot");
  const statusAfterSchedule = await billing.getSubscriptionStatus(subscriptionId);
  assert(statusAfterSchedule.stripeStatus === "trialing", "still trialing during the notice window");
  // When trial_end arrives Stripe ends the trial and fires
  // customer.subscription.updated; simulate both here, synchronously.
  if (billing instanceof FakeBillingProvider) billing.setStatusForTest(subscriptionId, "active");
  const reconcile1 = await applyStripeStatus(prisma, billing, operatorId);
  op = await prisma.operator.findUniqueOrThrow({ where: { id: operatorId } });
  assert(op.billingStatus === "active", "billingStatus is 'active' after the trial-end webhook lands");
  assert(op.trialEndedAt !== null, "trialEndedAt stamped");
  assert(reconcile1.trialEndedEmail?.sent === false && reconcile1.trialEndedEmail.reason === "stub", "trial-ended email attempted (stub path, no RESEND_API_KEY)");
  const trialEndedAtAfterCap = op.trialEndedAt;

  // ---- 8) Idempotency: re-applying the SAME non-trialing status must not re-fire ----
  console.log("\n8) Re-applying the same status a second time (simulated webhook retry) does not re-send or re-stamp:");
  const reconcile2 = await applyStripeStatus(prisma, billing, operatorId);
  op = await prisma.operator.findUniqueOrThrow({ where: { id: operatorId } });
  assert(reconcile2.trialEndedEmail === undefined, "no second trial-ended email claim attempted (already past the trialing->non-trialing transition)");
  assert(op.trialEndedAt?.getTime() === trialEndedAtAfterCap?.getTime(), "trialEndedAt unchanged on retry");

  await prisma.operator.delete({ where: { id: operatorId } });

  // ---- 9) The 30-day guarantee, via the daily job ----
  console.log("\n9) Day 30 without 20 screened candidates: the daily job refunds the $149 and cancels:");
  const freshOperator = async (tag: string) => {
    const email = `founder@${tag}demo.com`;
    await prisma.operator.deleteMany({ where: { email } });
    const { operatorId: id } = await provision(
      prisma,
      { instagramHandle: `@${tag}demo`, role: { title: "Barista" }, calendarChoice: "google", operatorEmail: email },
      { startTrial: false },
    );
    const co = await startFoundingCheckout(prisma, billing, id, {
      successUrl: "http://localhost:3000/dashboard?checkout=success",
      cancelUrl: "http://localhost:3000/onboarding?canceled=1",
    });
    const sub = `sub_test_${id}`;
    await confirmFoundingPayment(prisma, billing, id, {
      customerId: `cus_test_${id}`,
      subscriptionId: sub,
      checkoutSessionId: co.sessionId,
      livemode: false,
    });
    return { id, sub };
  };
  const g = await freshOperator("guarantee");
  let gop = await prisma.operator.findUniqueOrThrow({ where: { id: g.id } });
  assert(gop.guaranteeEndsAt !== null, "guaranteeEndsAt set at checkout confirmation");
  const days = (gop.guaranteeEndsAt!.getTime() - Date.now()) / (24 * 3600 * 1000);
  assert(days > 29.9 && days <= 30, "guaranteeEndsAt is 30 days out");
  // Not due yet: the job leaves it alone.
  const { POST: reconcile } = await import("../src/app/api/jobs/reconcile-trials/route");
  const runJob = () =>
    reconcile(new Request("http://localhost:3000/api/jobs/reconcile-trials", {
      method: "POST",
      headers: { "x-admin-secret": process.env.JOBS_ADMIN_SECRET! },
    }));
  await runJob();
  gop = await prisma.operator.findUniqueOrThrow({ where: { id: g.id } });
  assert(gop.guaranteeRefundedAt === null && gop.billingStatus === "trialing", "before day 30: untouched");
  // Day 30 passes with 12 screened.
  await prisma.operator.update({
    where: { id: g.id },
    data: { guaranteeEndsAt: new Date(Date.now() - 60_000), screenedCandidateCount: 12 },
  });
  const jobRes = await runJob();
  const jobBody = (await jobRes.json()) as { guarantee: { due: number; refunded: number } };
  assert(jobBody.guarantee.refunded >= 1, "job reports the refund");
  gop = await prisma.operator.findUniqueOrThrow({ where: { id: g.id } });
  assert(gop.guaranteeRefundedAt !== null, "guaranteeRefundedAt stamped");
  assert(gop.billingStatus === "canceled", "billingStatus is 'canceled'");
  assert(gop.guaranteeRefundEmailSentAt !== null, "refund email claimed");
  if (billing instanceof FakeBillingProvider) {
    const live = await billing.getSubscriptionStatus(g.sub);
    assert(live.stripeStatus === "canceled", "subscription canceled on the billing side");
  }
  // Idempotent: a second run refunds nothing more.
  const again = await honorGuarantee(prisma, billing, g.id);
  assert(!again.honored && again.reason === "already-honored", "second run is a no-op");
  await prisma.operator.delete({ where: { id: g.id } });

  // ---- 10) Reached the cap before day 30: never refunded ----
  console.log("\n10) An operator who reached 20 is never refunded, even past day 30:");
  const c = await freshOperator("capreached");
  await prisma.operator.update({
    where: { id: c.id },
    data: { guaranteeEndsAt: new Date(Date.now() - 60_000), screenedCandidateCount: 20, trialCapReachedAt: new Date() },
  });
  const capRes = await honorGuarantee(prisma, billing, c.id);
  assert(!capRes.honored && capRes.reason === "not-eligible", "not eligible once the cap is reached");
  await prisma.operator.delete({ where: { id: c.id } });

  // ---- 11) Safety net: Stripe ends the trial on its own before the job ran ----
  console.log("\n11) Stripe's own trial end with fewer than 20: applyStripeStatus refunds and cancels instead of billing:");
  const s2 = await freshOperator("backstop");
  await prisma.operator.update({ where: { id: s2.id }, data: { screenedCandidateCount: 5 } });
  if (billing instanceof FakeBillingProvider) billing.setStatusForTest(s2.sub, "active");
  const net = await applyStripeStatus(prisma, billing, s2.id);
  const op2 = await prisma.operator.findUniqueOrThrow({ where: { id: s2.id } });
  assert(net.trialEndedEmail === undefined, "no 'you're on $4,788/year' email");
  assert(op2.guaranteeRefundedAt !== null && op2.billingStatus === "canceled", "refunded and canceled");
  await prisma.operator.delete({ where: { id: s2.id } });

  console.log("\nFounding subscription smoke test PASSED.");
}

main()
  .catch((e) => {
    console.error("\n" + e.message);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
