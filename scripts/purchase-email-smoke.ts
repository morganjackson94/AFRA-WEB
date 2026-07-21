import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { confirmFoundingPayment } from "../src/lib/activation";
import { provision } from "../src/lib/provision";

// Proves the founding purchase-confirmation email's gating and idempotency
// (docs/CLAIMS.md-driven brief, implemented in activation.ts's
// sendPurchaseConfirmationOnce): a Stripe TEST-mode confirmation does NOT
// send by default, an explicit SEND_TEST_PURCHASE_EMAIL=1 override does, and
// a second confirmFoundingPayment call for the same operator (webhook retry)
// never re-sends. Does not require RESEND_API_KEY — without it, mail.ts's
// stub path logs the full rendered copy instead of calling Resend, which
// this script relies on to prove the template renders without throwing.

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!) });

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
  console.log("1) TEST-mode confirmation (livemode: false), no override — must NOT send:");
  const opA = await freshOperator("purchaseemailsmokea");
  const resultA = await confirmFoundingPayment(prisma, opA, { livemode: false });
  assert(resultA.purchaseEmail.sent === false, "purchaseEmail.sent is false");
  assert(
    !resultA.purchaseEmail.sent && resultA.purchaseEmail.reason === "not-livemode",
    `reason is 'not-livemode' (got: ${JSON.stringify(resultA.purchaseEmail)})`,
  );
  const opARow = await prisma.operator.findUniqueOrThrow({ where: { id: opA } });
  assert(opARow.purchaseConfirmationEmailSentAt === null, "purchaseConfirmationEmailSentAt stays null — no claim taken");

  console.log("\n2) TEST-mode confirmation WITH explicit SEND_TEST_PURCHASE_EMAIL=1 override — must send (stub path, no RESEND_API_KEY):");
  process.env.SEND_TEST_PURCHASE_EMAIL = "1";
  const opB = await freshOperator("purchaseemailsmokeb");
  const resultB = await confirmFoundingPayment(prisma, opB, { livemode: false });
  const expectedReason = process.env.RESEND_API_KEY ? "sent for real" : "stub";
  console.log(`   RESEND_API_KEY configured: ${Boolean(process.env.RESEND_API_KEY)} — expecting: ${expectedReason}`);
  if (process.env.RESEND_API_KEY) {
    assert(resultB.purchaseEmail.sent === true, "purchaseEmail.sent is true (real Resend call succeeded)");
  } else {
    assert(resultB.purchaseEmail.sent === false, "purchaseEmail.sent is false (stub — no RESEND_API_KEY in this env)");
    assert(
      !resultB.purchaseEmail.sent && resultB.purchaseEmail.reason === "stub",
      `reason is 'stub' (got: ${JSON.stringify(resultB.purchaseEmail)})`,
    );
  }
  const opBRowFirst = await prisma.operator.findUniqueOrThrow({ where: { id: opB } });
  assert(opBRowFirst.purchaseConfirmationEmailSentAt !== null, "purchaseConfirmationEmailSentAt is now set — claim taken");
  const firstSentAt = opBRowFirst.purchaseConfirmationEmailSentAt;

  console.log("\n3) Second confirmFoundingPayment call for the SAME operator (simulated webhook retry) — must NOT re-send:");
  const resultB2 = await confirmFoundingPayment(prisma, opB, { livemode: false });
  assert(
    !resultB2.purchaseEmail.sent && resultB2.purchaseEmail.reason === "already-sent",
    `reason is 'already-sent' on retry (got: ${JSON.stringify(resultB2.purchaseEmail)})`,
  );
  const opBRowSecond = await prisma.operator.findUniqueOrThrow({ where: { id: opB } });
  assert(
    opBRowSecond.purchaseConfirmationEmailSentAt?.getTime() === firstSentAt?.getTime(),
    "purchaseConfirmationEmailSentAt is unchanged — no second claim, no duplicate send",
  );
  delete process.env.SEND_TEST_PURCHASE_EMAIL;

  console.log("\n4) A real livemode: true confirmation sends without needing the test override:");
  const opC = await freshOperator("purchaseemailsmokec");
  const resultC = await confirmFoundingPayment(prisma, opC, { livemode: true });
  if (process.env.RESEND_API_KEY) {
    assert(resultC.purchaseEmail.sent === true, "purchaseEmail.sent is true on a real livemode confirmation");
  } else {
    assert(
      !resultC.purchaseEmail.sent && resultC.purchaseEmail.reason === "stub",
      `reason is 'stub' on livemode confirmation without RESEND_API_KEY (got: ${JSON.stringify(resultC.purchaseEmail)})`,
    );
  }

  await prisma.operator.deleteMany({ where: { id: { in: [opA, opB, opC] } } });
  console.log("\nPurchase confirmation email smoke test PASSED.");
}

main()
  .catch((e) => {
    console.error("\n" + e.message);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
