import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { countActiveFoundingOperators } from "../src/lib/activation";
import { FOUNDING_SPOTS_TOTAL } from "../src/lib/billing";

// Proves the seat-cap logic both the landing page counter and
// startOnboardingAction's hard gate depend on: countActiveFoundingOperators()
// accurately reflects real billingStatus="active" founding operators,
// excludes synthetic test emails so it can't be skewed by dev/smoke records,
// excludes Stripe TEST-mode confirmed payments via stripeLivemode (so testing
// in Stripe test mode, including the live-mode E2E test, can never consume a
// real founding seat), and the same threshold check actions.ts uses
// (count >= FOUNDING_SPOTS_TOTAL) actually trips once the real cap
// ("first 10 only") is reached. Creates throwaway operators directly (not
// through full provision()/Stripe — this tests the count/cap logic, not
// checkout) and deletes them afterward.

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!) });

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

const TEST_EMAILS = Array.from({ length: FOUNDING_SPOTS_TOTAL }, (_, i) => `cap-test-${i + 1}@afra-cap-smoke.test`);
const EXCLUDED_EMAIL = "cap-test-excluded@smoke.test"; // must be excluded by the @smoke.test filter
const TEST_MODE_EMAIL = "cap-test-livemode-false@afra-cap-smoke.test"; // must be excluded by stripeLivemode

async function main() {
  await prisma.operator.deleteMany({ where: { email: { in: [...TEST_EMAILS, EXCLUDED_EMAIL, TEST_MODE_EMAIL] } } });

  const baseline = await countActiveFoundingOperators(prisma);
  console.log(`Baseline active founding operators (real production data): ${baseline}`);

  console.log(`\n1) count reflects reality as real active founding operators are added:`);
  for (let i = 0; i < TEST_EMAILS.length; i++) {
    await prisma.operator.create({
      data: {
        name: `Cap Test ${i + 1}`,
        email: TEST_EMAILS[i],
        plan: "founding_annual",
        billingStatus: "active",
        stripeLivemode: true, // simulates a real, live-mode-confirmed payment
      },
    });
  }
  const afterTen = await countActiveFoundingOperators(prisma);
  assert(afterTen === baseline + FOUNDING_SPOTS_TOTAL, `count increased by exactly ${FOUNDING_SPOTS_TOTAL} (baseline ${baseline} -> ${afterTen})`);

  console.log(`\n2) synthetic test-domain emails are excluded even when active:`);
  await prisma.operator.create({
    data: {
      name: "Cap Test Excluded",
      email: EXCLUDED_EMAIL,
      plan: "founding_annual",
      billingStatus: "active",
      stripeLivemode: true,
    },
  });
  const afterExcluded = await countActiveFoundingOperators(prisma);
  assert(afterExcluded === afterTen, "an @smoke.test email does not count toward the cap, even with billingStatus=active");

  console.log(`\n2b) a Stripe TEST-mode confirmed payment (stripeLivemode: false) does not count, even at a realistic-looking email:`);
  await prisma.operator.create({
    data: {
      name: "Cap Test Livemode False",
      email: TEST_MODE_EMAIL,
      plan: "founding_annual",
      billingStatus: "active",
      stripeLivemode: false,
    },
  });
  const afterTestMode = await countActiveFoundingOperators(prisma);
  assert(
    afterTestMode === afterExcluded,
    "billingStatus=active with stripeLivemode=false does not count toward the cap — this is the exact scenario (a realistic-looking test-mode signup) that slipped past the old email-pattern-only filter",
  );

  console.log(`\n3) the exact threshold check actions.ts uses actually trips at the real cap:`);
  // This mirrors src/app/onboarding/actions.ts's gate condition exactly:
  //   if (isFounding && (await countActiveFoundingOperators(prisma)) >= FOUNDING_SPOTS_TOTAL)
  // baseline + FOUNDING_SPOTS_TOTAL is always >= FOUNDING_SPOTS_TOTAL (baseline >= 0),
  // so the gate must trip regardless of how many real operators already existed.
  const wouldBlock = (await countActiveFoundingOperators(prisma)) >= FOUNDING_SPOTS_TOTAL;
  assert(wouldBlock, `checkout's cap gate would block an 11th founding signup (count ${afterTen} >= cap ${FOUNDING_SPOTS_TOTAL})`);

  console.log(`\n4) removing one active operator re-opens exactly one slot:`);
  await prisma.operator.delete({ where: { email: TEST_EMAILS[0] } });
  const afterRemovingOne = await countActiveFoundingOperators(prisma);
  assert(afterRemovingOne === afterTen - 1, "count drops by exactly 1 when one active founding operator is removed");

  await prisma.operator.deleteMany({ where: { email: { in: [...TEST_EMAILS, EXCLUDED_EMAIL, TEST_MODE_EMAIL] } } });
  const afterCleanup = await countActiveFoundingOperators(prisma);
  assert(afterCleanup === baseline, "cleanup restores the exact original baseline — no test pollution left behind");

  console.log("\nFounding cap smoke test PASSED.");
}

main()
  .catch((e) => {
    console.error("\n" + e.message);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
