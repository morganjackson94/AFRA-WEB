import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { requireDevDatabase } from "./lib/guardDatabase";
import { confirmFoundingPayment } from "../src/lib/activation";
import { getBillingProvider } from "../src/lib/billing";
import { provision } from "../src/lib/provision";

// Proves the welcome email's gating and idempotency (src/lib/activation.ts's
// sendWelcomeEmailOnce, called from confirmFoundingPayment):
//   - a Stripe TEST-mode confirmation does NOT send by default
//   - an explicit SEND_TEST_WELCOME_EMAIL=1 override does
//   - it always sends variant B (awaiting-setup) — automatic flow assignment
//     (the flow pool, manychatPool.ts) was retired; see activation.ts
//   - a second confirmFoundingPayment call for the same operator (webhook
//     retry) never re-sends
// Does not require RESEND_API_KEY — without it, mail.ts's stub path logs the
// full rendered copy instead of calling Resend, which this script relies on
// to prove the template renders without throwing.

let prisma: PrismaClient;
const billing = getBillingProvider();

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function freshOperator(handle: string) {
  await prisma.operator.deleteMany({ where: { email: `${handle}@pending.afra.local` } });
  const { operatorId } = await provision(prisma, {
    instagramHandle: `@${handle}`,
    role: { title: "Server" },
    calendarChoice: "google",
  });
  return operatorId;
}

async function main() {
  prisma = await requireDevDatabase();

  console.log("1) TEST-mode confirmation (livemode: false), no override — must NOT send:");
  const opA = await freshOperator("welcomeemailsmokea");
  const resultA = await confirmFoundingPayment(prisma, billing, opA, { subscriptionId: `sub_test_${opA}`, livemode: false });
  assert(resultA.welcomeEmail.sent === false, "welcomeEmail.sent is false");
  assert(
    !resultA.welcomeEmail.sent && resultA.welcomeEmail.reason === "not-livemode",
    `reason is 'not-livemode' (got: ${JSON.stringify(resultA.welcomeEmail)})`,
  );
  const opARow = await prisma.operator.findUniqueOrThrow({ where: { id: opA } });
  assert(opARow.welcomeEmailSentAt === null, "welcomeEmailSentAt stays null — no claim taken");
  // checkinEmailDueAt is set on every confirmFoundingPayment call regardless of
  // livemode, same as billingStatus itself — livemode only gates the welcome
  // email decision and the founding-cap count, not payment confirmation itself.
  assert(opARow.checkinEmailDueAt !== null, "checkinEmailDueAt is set — this WAS a (test-mode) payment confirmation");

  console.log("\n2) TEST-mode WITH override — must send variant B (awaiting-setup):");
  process.env.SEND_TEST_WELCOME_EMAIL = "1";
  const opB = await freshOperator("welcomeemailsmokeb");
  const resultB = await confirmFoundingPayment(prisma, billing, opB, { subscriptionId: `sub_test_${opB}`, livemode: false });
  assert(
    !resultB.flowAssignment.assigned && resultB.flowAssignment.reason === "pool-retired",
    `flow assignment is retired (got: ${JSON.stringify(resultB.flowAssignment)})`,
  );
  const expectedReason = process.env.RESEND_API_KEY ? "sent for real" : "stub";
  console.log(`   RESEND_API_KEY configured: ${Boolean(process.env.RESEND_API_KEY)} — expecting: ${expectedReason}`);
  if (process.env.RESEND_API_KEY) {
    assert(
      resultB.welcomeEmail.sent === true && resultB.welcomeEmail.variant === "awaiting-setup",
      "welcomeEmail sent, variant 'awaiting-setup' (real Resend call succeeded)",
    );
  } else {
    assert(
      !resultB.welcomeEmail.sent && resultB.welcomeEmail.reason === "stub",
      `reason is 'stub' (got: ${JSON.stringify(resultB.welcomeEmail)})`,
    );
  }
  const opBRowFirst = await prisma.operator.findUniqueOrThrow({ where: { id: opB } });
  assert(opBRowFirst.welcomeEmailSentAt !== null, "welcomeEmailSentAt is now set — claim taken");
  assert(opBRowFirst.checkinEmailDueAt !== null, "checkinEmailDueAt was set at payment confirmation");
  const firstSentAt = opBRowFirst.welcomeEmailSentAt;

  console.log("\n3) Second confirmFoundingPayment call for the SAME operator (simulated webhook retry) — must NOT re-send:");
  const resultB2 = await confirmFoundingPayment(prisma, billing, opB, { livemode: false });
  assert(
    !resultB2.welcomeEmail.sent && resultB2.welcomeEmail.reason === "already-sent",
    `reason is 'already-sent' on retry (got: ${JSON.stringify(resultB2.welcomeEmail)})`,
  );
  const opBRowSecond = await prisma.operator.findUniqueOrThrow({ where: { id: opB } });
  assert(
    opBRowSecond.welcomeEmailSentAt?.getTime() === firstSentAt?.getTime(),
    "welcomeEmailSentAt is unchanged — no second claim, no duplicate send",
  );
  assert(
    opBRowSecond.checkinEmailDueAt?.getTime() === opBRowFirst.checkinEmailDueAt?.getTime(),
    "checkinEmailDueAt is unchanged on retry — the fuse isn't pushed out",
  );

  console.log("\n4) Real livemode: true confirmation, no override needed — must send variant B (awaiting-setup):");
  const opC = await freshOperator("welcomeemailsmokec");
  const resultC = await confirmFoundingPayment(prisma, billing, opC, { subscriptionId: `sub_test_${opC}`, livemode: true });
  assert(
    !resultC.flowAssignment.assigned && resultC.flowAssignment.reason === "pool-retired",
    `flow assignment is retired (got: ${JSON.stringify(resultC.flowAssignment)})`,
  );
  if (process.env.RESEND_API_KEY) {
    assert(
      resultC.welcomeEmail.sent === true && resultC.welcomeEmail.variant === "awaiting-setup",
      "welcomeEmail sent, variant 'awaiting-setup' on a real livemode confirmation",
    );
  } else {
    assert(
      !resultC.welcomeEmail.sent && resultC.welcomeEmail.reason === "stub",
      `reason is 'stub' on livemode confirmation without RESEND_API_KEY (got: ${JSON.stringify(resultC.welcomeEmail)})`,
    );
  }

  delete process.env.SEND_TEST_WELCOME_EMAIL;
  await prisma.operator.deleteMany({ where: { id: { in: [opA, opB, opC] } } });
  console.log("\nWelcome email smoke test PASSED.");
}

main()
  .catch((e) => {
    console.error("\n" + e.message);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
