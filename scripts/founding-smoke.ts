import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { requireDevDatabase } from "./lib/guardDatabase";
import {
  applyStripeStatus,
  confirmFoundingPayment,
  endTrialForCandidateCap,
  recomputeOperatorReadiness,
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
// triggered it — the candidate cap (endTrialForCandidateCap) or Stripe's own
// 60-day backstop — proven identical below.

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
  console.log("\n7) Candidate #20 crosses the cap -> endTrialForCandidateCap -> Stripe ends the trial -> webhook lands in applyStripeStatus:");
  await endTrialForCandidateCap(prisma, billing, operatorId);
  const statusAfterEndTrialNow = await billing.getSubscriptionStatus(subscriptionId);
  assert(statusAfterEndTrialNow.stripeStatus === "active", "billing.endTrialNow flipped the (fake) subscription to active");
  // In real life, ending the trial fires customer.subscription.updated async;
  // simulate that webhook landing here, synchronously, same as the real route does.
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

  // ---- 9) The OTHER trial-end cause (Stripe's own 60-day backstop) produces the IDENTICAL outcome ----
  console.log("\n9) A fresh operator whose trial ends via the 60-day backstop instead (bypassing endTrialForCandidateCap entirely):");
  const email2 = "founder@backstopdemo.com";
  await prisma.operator.deleteMany({ where: { email: email2 } });
  const { operatorId: operatorId2 } = await provision(
    prisma,
    { instagramHandle: "@backstopdemo", role: { title: "Barista" }, calendarChoice: "google", operatorEmail: email2 },
    { startTrial: false },
  );
  const checkout2 = await startFoundingCheckout(prisma, billing, operatorId2, {
    successUrl: "http://localhost:3000/dashboard?checkout=success",
    cancelUrl: "http://localhost:3000/onboarding?canceled=1",
  });
  const subscriptionId2 = `sub_test_${operatorId2}`;
  await confirmFoundingPayment(prisma, billing, operatorId2, {
    customerId: `cus_test_${operatorId2}`,
    subscriptionId: subscriptionId2,
    checkoutSessionId: checkout2.sessionId,
    livemode: false,
  });
  // Stripe's own day-60 transition fires customer.subscription.updated with
  // NO app-initiated endTrialNow call anywhere in this path — simulate that
  // directly, proving the shared reconciliation path is real, not aspirational.
  // applyStripeStatus now re-fetches live status rather than trusting a
  // passed-in string, so the fake has to be told directly that Stripe's side
  // changed (real Stripe would have actually done this on its own).
  if (billing instanceof FakeBillingProvider) billing.setStatusForTest(subscriptionId2, "active");
  const backstopReconcile = await applyStripeStatus(prisma, billing, operatorId2);
  const op2 = await prisma.operator.findUniqueOrThrow({ where: { id: operatorId2 } });
  assert(op2.billingStatus === "active", "billingStatus is 'active' after the natural backstop transition");
  assert(op2.trialEndedAt !== null, "trialEndedAt stamped identically to the candidate-cap path");
  assert(backstopReconcile.trialEndedEmail?.sent === false && backstopReconcile.trialEndedEmail.reason === "stub", "the SAME trial-ended email fires for the backstop cause");
  await prisma.operator.delete({ where: { id: operatorId2 } });

  console.log("\nFounding subscription smoke test PASSED.");
}

main()
  .catch((e) => {
    console.error("\n" + e.message);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
