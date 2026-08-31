import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { confirmFoundingPayment, applyStripeStatus } from "../src/lib/activation";
import { FREE_CANDIDATE_CAP, getBillingProvider } from "../src/lib/billing";
import { ingestScreeningResult } from "../src/lib/manychat";
import { provision } from "../src/lib/provision";
import { startFoundingCheckout } from "../src/lib/activation";

// Proves the candidate-counter wiring in ingestScreeningResult (manychat.ts):
// each candidate that reaches "screened" increments Operator.
// screenedCandidateCount exactly once, even under simulated duplicate
// ManyChat webhook delivery (the SAME candidate re-ingested), and crossing
// FREE_CANDIDATE_CAP triggers exactly one endTrialForCandidateCap call (which
// this test observes via the fake billing provider's subscription status
// flipping to "active").

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!) });
const billing = getBillingProvider();

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function main() {
  const email = "founder@trialcountersmoke.com";
  await prisma.operator.deleteMany({ where: { email } });

  const { operator } = await provision(
    prisma,
    { instagramHandle: "@trialcountersmoke", role: { title: "Barista" }, calendarChoice: "google", operatorEmail: email },
    { startTrial: false },
  );
  const locationId = operator.locations[0].id;

  // Get the operator into a real "trialing" state with a subscription id, the
  // same way a real signup does, so endTrialForCandidateCap has something to
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

  console.log(`1) Ingesting ${FREE_CANDIDATE_CAP} distinct screened candidates:`);
  for (let i = 1; i <= FREE_CANDIDATE_CAP; i++) {
    const result = await ingestScreeningResult(prisma, {
      locationId,
      contact: `@candidate${i}`,
      outcome: "passed",
    });
    if (!result.ok) throw new Error(`ingest failed at candidate ${i}: ${result.error}`);
  }
  let op = await prisma.operator.findUniqueOrThrow({ where: { id: operator.id } });
  assert(op.screenedCandidateCount === FREE_CANDIDATE_CAP, `screenedCandidateCount is exactly ${FREE_CANDIDATE_CAP}`);

  console.log("\n2) Crossing the cap called endTrialForCandidateCap, which called Stripe:");
  const subStatus = await billing.getSubscriptionStatus(subscriptionId);
  assert(subStatus.stripeStatus === "active", "the fake subscription flipped to 'active' — endTrialNow was actually invoked");
  assert(op.billingStatus === "trialing", "billingStatus itself is untouched by the counter (only the webhook flips it — see founding-smoke.ts)");

  // Simulate that webhook landing, same as founding-smoke.ts, to prove the
  // full loop closes.
  await applyStripeStatus(prisma, billing, operator.id);
  op = await prisma.operator.findUniqueOrThrow({ where: { id: operator.id } });
  assert(op.billingStatus === "active", "billingStatus flips to 'active' once the resulting webhook is processed");
  assert(op.trialEndedAt !== null, "trialEndedAt stamped");

  console.log("\n3) Duplicate delivery: re-ingesting an ALREADY-counted candidate must not double-count:");
  const beforeCount = op.screenedCandidateCount;
  const dup = await ingestScreeningResult(prisma, {
    locationId,
    contact: "@candidate1", // already ingested above, already countedTowardTrial
    outcome: "passed",
  });
  if (!dup.ok) throw new Error(`duplicate ingest failed: ${dup.error}`);
  op = await prisma.operator.findUniqueOrThrow({ where: { id: operator.id } });
  assert(op.screenedCandidateCount === beforeCount, "screenedCandidateCount unchanged on re-ingest of the same candidate");

  console.log("\n4) A candidate who fails screening never counts:");
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
