import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  confirmFoundingPayment,
  recomputeOperatorReadiness,
  startFoundingCheckout,
} from "../src/lib/activation";
import { getBillingProvider } from "../src/lib/billing";
import { evaluateReadiness, isBillingActive } from "../src/lib/readiness";
import { connectStubbedIntegrations } from "../src/lib/testing";
import { provision } from "../src/lib/provision";

// Step proof: founding annual = charge at signup (no trial). provision -> hosted
// checkout -> billing flips to "active" ONLY on (simulated) webhook confirmation,
// via evaluateReadiness(). Abandoned checkout stays unpaid. Paid != live.

const prisma = new PrismaClient({
  adapter: new PrismaPg(process.env.DATABASE_URL!),
});
const billing = getBillingProvider();

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function role(operatorId: string) {
  return prisma.role.findFirstOrThrow({ where: { location: { operatorId } } });
}

async function main() {
  console.log(`Billing provider mode: ${billing.mode}\n`);

  // ---- 1) Founding signup: provision WITHOUT a trial, then start checkout ----
  const email = "founder@annualdemo.com";
  await prisma.operator.deleteMany({ where: { email } });

  const { operatorId } = await provision(
    prisma,
    { instagramHandle: "@annualdemo", role: { title: "Barista", pay: "$18/hr" }, calendarChoice: "google", operatorEmail: email },
    { startTrial: false }, // founding is paid-from-day-one — NO monthly trial
  );

  let op = await prisma.operator.findUniqueOrThrow({ where: { id: operatorId } });
  let r = await role(operatorId);
  console.log("1) After provision (no trial):");
  assert(op.billingStatus === "trial_pending", "billingStatus is 'trial_pending' (unpaid)");
  assert(op.stripeSubscriptionId === null, "no monthly subscription created");
  assert(r.gateBilling === false, "gateBilling FALSE before payment (via evaluateReadiness)");

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
  assert(op.billingStatus !== "active", "operator exists but is NOT active");
  assert(r.gateBilling === false, "gateBilling stays FALSE when checkout is abandoned");
  assert(r.readinessState !== "live", "abandoned-checkout operator is not live");

  // ---- 3) Webhook-confirmed payment => active, gateBilling true via SSOT ----
  console.log("\n3) Webhook confirms payment (the ONLY thing that flips to active):");
  await confirmFoundingPayment(prisma, operatorId, {
    customerId: `cus_test_${operatorId}`,
    paymentIntentId: `pi_test_${operatorId}`,
    checkoutSessionId: checkout.sessionId,
  });
  op = await prisma.operator.findUniqueOrThrow({ where: { id: operatorId } });
  r = await role(operatorId);
  console.log(`   billingStatus=${op.billingStatus} gateBilling=${r.gateBilling} state=${r.readinessState}`);
  assert(op.billingStatus === "active", "billingStatus flips to 'active' on webhook confirmation");
  assert(isBillingActive(op.billingStatus) === true, "isBillingActive(active) true (SSOT predicate)");
  assert(r.gateBilling === true, "gateBilling TRUE — derived by evaluateReadiness from billingStatus");
  assert(op.stripePaymentIntentId === `pi_test_${operatorId}`, "payment intent id stored (for manual refunds)");

  // ---- 4) Paid != live: channel/calendar still stubbed => still 'ready' ----
  console.log("\n4) Paid founding operator still reads NOT live (stubs):");
  assert(r.gatePlatform === false && r.gateCalendar === false, "channel + calendar gates still FALSE (stubbed)");
  assert(r.readinessState === "ready", "readinessState is 'ready', NOT 'live' — paying ≠ live");

  // Sanity: the gate math is the SSOT, not ad-hoc.
  const recomputed = evaluateReadiness({
    channelStatus: "stubbed",
    calendarStatus: "stubbed",
    template: { slots: { headline: "x", roleLabel: "y", payLabel: "z" } },
    billingStatus: op.billingStatus,
  });
  assert(recomputed.gateBilling === true && recomputed.readinessState === "ready", "evaluateReadiness agrees: gateBilling true, state ready");

  // ---- 5) Only after connecting stubs does it go live (paying didn't) ----
  console.log("\n5) Connecting channel+calendar is what makes it live (not paying):");
  await connectStubbedIntegrations(prisma, operatorId);
  const live = await recomputeOperatorReadiness(prisma, operatorId);
  r = await role(operatorId);
  assert(r.readinessState === "live", "now live after channel+calendar connected");
  assert(live.wentLiveFired === true, "WentLive fired on the real live transition (not on payment)");

  // ---- 6) Idempotent re-confirm ----
  const before = await prisma.event.count({ where: { operatorId, type: "WentLive" } });
  await confirmFoundingPayment(prisma, operatorId, {});
  const after = await prisma.event.count({ where: { operatorId, type: "WentLive" } });
  assert(before === after, "re-confirming payment does not double-fire WentLive (idempotent)");

  await prisma.operator.delete({ where: { id: operatorId } });
  console.log("\nFounding annual smoke test PASSED.");
}

main()
  .catch((e) => {
    console.error("\n" + e.message);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
