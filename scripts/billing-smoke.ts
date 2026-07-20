import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  applyStripeStatus,
  cancelBilling,
  recomputeOperatorReadiness,
} from "../src/lib/activation";
import { getBillingProvider } from "../src/lib/billing";
import { emitEvent } from "../src/lib/events";
import { isBillingActive } from "../src/lib/readiness";
import { connectStubbedIntegrations } from "../src/lib/testing";
import { provision } from "../src/lib/provision";

// Step 3 proof: Stripe trial lifecycle, gateBilling via evaluateReadiness(),
// StartedSetup fires once on setup start, WentLive does NOT fire on trial-start
// and DOES fire exactly once on the true live transition. Meta forward stubbed.

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });
const billing = getBillingProvider();

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

const EMAIL = "founder@joescoffee.com"; // real email via override

async function role(operatorId: string) {
  return prisma.role.findFirstOrThrow({ where: { location: { operatorId } } });
}
async function eventTypes(operatorId: string) {
  const evs = await prisma.event.findMany({ where: { operatorId }, orderBy: { createdAt: "asc" } });
  return evs.map((e) => ({ type: e.type, metaForwarded: e.metaForwarded }));
}

async function main() {
  console.log(`Billing provider mode: ${billing.mode}` +
    (billing.mode === "fake" ? "  (set STRIPE_SECRET_KEY=sk_test_... for real Stripe test mode)" : ""));

  await prisma.operator.deleteMany({ where: { email: EMAIL } });

  // --- Provision with a real email override (used for the Stripe customer) ---
  console.log("\n1) provision (auto-starts trial) ->");
  const { operatorId, startedSetupFired, billing: billed } = await provision(
    prisma,
    {
      instagramHandle: "@joescoffee",
      role: { title: "Barista", pay: "$19/hr" },
      calendarChoice: "google",
      operatorEmail: EMAIL,
    },
    { billing },
  );
  const op1 = await prisma.operator.findUniqueOrThrow({ where: { id: operatorId } });
  let r = await role(operatorId);
  console.log(`   email=${op1.email} customer=${op1.stripeCustomerId} sub=${op1.stripeSubscriptionId}`);
  console.log(`   billingStatus=${op1.billingStatus} role.gateBilling=${r.gateBilling} state=${r.readinessState}`);
  console.log(`   events=${JSON.stringify(await eventTypes(operatorId))}`);

  assert(op1.email === EMAIL, "Stripe customer uses the real operatorEmail override, not @pending");
  assert(!!op1.stripeCustomerId, "Stripe customer id stored on Operator");
  assert(!!op1.stripeSubscriptionId, "Stripe subscription id stored on Operator");
  assert(op1.billingStatus === "trialing", "lifecycle advanced trial_pending -> trialing");
  assert(billed?.billingStatus === "trialing", "startTrial reported trialing");

  console.log("\n2) gateBilling flows through evaluateReadiness():");
  assert(isBillingActive(op1.billingStatus) === true, "isBillingActive(trialing) === true (SSOT predicate)");
  assert(r.gateBilling === true, "role.gateBilling TRUE — derived by evaluateReadiness from billingStatus");
  assert(r.gatePlatform === false && r.gateCalendar === false, "platform+calendar still FALSE (stubbed)");
  assert(r.readinessState === "ready", "TRIALING + gateBilling=true is STILL 'ready', NOT 'live'");

  console.log("\n3) StartedSetup fired once; WentLive NOT fired on trial-start:");
  assert(startedSetupFired === true, "StartedSetup fired during provision");
  const evs1 = await eventTypes(operatorId);
  assert(evs1.filter((e) => e.type === "StartedSetup").length === 1, "exactly one StartedSetup");
  assert(evs1.every((e) => e.metaForwarded), "fired events were forwarded to Meta (stub)");
  assert(!evs1.some((e) => e.type === "WentLive"), "NO WentLive on mere trial-start (trial != live)");

  // Idempotency: re-emitting StartedSetup must not double-fire.
  const reStart = await emitEvent(prisma, { operatorId, type: "StartedSetup" });
  assert(reStart.fired === false, "re-emitting StartedSetup is idempotent (does not double-fire)");
  assert(
    (await eventTypes(operatorId)).filter((e) => e.type === "StartedSetup").length === 1,
    "still exactly one StartedSetup after retry",
  );

  console.log("\n4) WentLive fires exactly once on the true live transition:");
  await connectStubbedIntegrations(prisma, operatorId); // test-only: B1/B2 'connected'
  const live1 = await recomputeOperatorReadiness(prisma, operatorId);
  r = await role(operatorId);
  console.log(`   after connect: state=${r.readinessState} gates(plat=${r.gatePlatform},cal=${r.gateCalendar},tmpl=${r.gateTemplate},bill=${r.gateBilling})`);
  assert(r.readinessState === "live", "ALL four gates true -> readinessState 'live'");
  assert(live1.wentLiveFired === true, "WentLive fired on the transition to live");
  const evs2 = await eventTypes(operatorId);
  assert(evs2.filter((e) => e.type === "WentLive").length === 1, "exactly one WentLive event");

  // Recompute again — must NOT re-fire WentLive (idempotent).
  const live2 = await recomputeOperatorReadiness(prisma, operatorId);
  assert(live2.operatorLive === true, "still live on re-check");
  assert(live2.wentLiveFired === false, "WentLive does NOT re-fire on subsequent checks (idempotent)");

  console.log("\n5) Dunning: a failed payment -> past_due -> gateBilling false:");
  const dunned = await applyStripeStatus(prisma, operatorId, "past_due");
  r = await role(operatorId);
  console.log(`   billingStatus=${dunned.billingStatus} gateBilling=${r.gateBilling} state=${r.readinessState}`);
  assert(dunned.billingStatus === "past_due", "past_due mapped from Stripe status");
  assert(r.gateBilling === false, "gateBilling FALSE when past_due — via evaluateReadiness");
  assert(r.readinessState === "ready", "drops out of 'live' back to 'ready' when billing lapses");

  console.log("\n6) Cancel:");
  const canceled = await cancelBilling(prisma, billing, operatorId);
  const op2 = await prisma.operator.findUniqueOrThrow({ where: { id: operatorId } });
  assert(canceled.billingStatus === "canceled", "cancel maps to 'canceled'");
  assert(op2.billingStatus === "canceled", "operator billingStatus persisted as canceled");

  // Cleanup
  await prisma.operator.delete({ where: { id: operatorId } });
  console.log("\nCleaned up. Billing smoke test PASSED.");
}

main()
  .catch((e) => {
    console.error("\n" + e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
