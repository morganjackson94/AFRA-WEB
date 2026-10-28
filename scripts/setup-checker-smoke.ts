import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { requireDevDatabase } from "./lib/guardDatabase";
import { confirmFoundingPayment, connectChannel, startFoundingCheckout } from "../src/lib/activation";
import { getBillingProvider } from "../src/lib/billing";
import { ingestScreeningResult } from "../src/lib/manychat";
import { provision } from "../src/lib/provision";
import { buildCaption, getSetupSummary } from "../src/lib/setupCheck";

// Setup checker (src/lib/setupCheck.ts) and the handoff email
// (sendHandoffEmailOnce, activation.ts). Walks one client from "just paid"
// to "ready to go live" and proves each check flips for the right reason —
// especially the webhook check, which must stay red until a candidate
// actually reaches AFRA.

let prisma: PrismaClient;

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

const EMAIL = "setupcheck@smoke.test";
const state = async (id: string) => {
  const s = (await getSetupSummary(prisma, id))!;
  return Object.fromEntries(s.checks.map((c) => [c.id, c.state])) as Record<string, string>;
};

async function main() {
  prisma = await requireDevDatabase();
  process.env.SEND_TEST_HANDOFF_EMAIL = "1"; // test-mode payment below; mail itself is the console stub
  await prisma.operator.deleteMany({ where: { email: EMAIL } });

  const { operatorId } = await provision(
    prisma,
    {
      instagramHandle: "@setupcheck",
      operatorName: "Juniper & Salt",
      role: { title: "Front of House", pay: "$16/hr" },
      roles: [{ title: "Front of House", pay: "$16/hr" }, { title: "Line Cook" }],
      calendarChoice: "google",
      operatorEmail: EMAIL,
      locationsBucket: "3-5",
      locationCount: 2,
      followerBand: "under_500",
      reachFlag: true,
      disqualifiers: ["no_weekends"],
    },
    { startTrial: false },
  );

  console.log("1) Just provisioned, not paid:");
  let s = (await getSetupSummary(prisma, operatorId))!;
  let st = await state(operatorId);
  assert(st.paid === "fail" && st.bookingLink === "fail" && st.instagram === "fail" && st.webhook === "fail", "paid, booking link, Instagram and webhook are all red");
  assert(st.locationId === "pass" && st.sheet === "manual", "Location ID is green; the Sheet is a manual check");
  assert(!s.readyToGoLive, "not ready to go live");
  assert(s.manychatBlanks.locationId === s.locations[0].id && s.locations.length === 2, "the Location ID blank is the first location's id");
  assert(s.manychatBlanks.bookingLink.startsWith("[MISSING"), "a missing booking link is flagged in the blanks, not left empty");
  assert(s.roles.map((r) => r.title).join() === "Front of House,Line Cook", "roles cloned per location are listed once each");
  assert(s.caption === buildCaption("Juniper & Salt", ["Front of House", "Line Cook"]) && s.caption.includes("DM us JOBS"), "caption names the business, the roles and the keyword");

  console.log("2) Payment confirmed (webhook path):");
  const billing = getBillingProvider();
  const checkout = await startFoundingCheckout(prisma, billing, operatorId, {
    successUrl: "http://localhost:3000/welcome",
    cancelUrl: "http://localhost:3000/onboarding",
  });
  const confirm = await confirmFoundingPayment(prisma, billing, operatorId, {
    customerId: `cus_test_${operatorId}`,
    subscriptionId: `sub_test_${operatorId}`,
    checkoutSessionId: checkout.sessionId,
    livemode: false,
  });
  assert(confirm.handoffEmail.sent === false && confirm.handoffEmail.reason === "stub", "the handoff email was attempted (console stub: no mail provider locally)");
  const claimed = await prisma.operator.findUniqueOrThrow({ where: { id: operatorId } });
  assert(claimed.handoffEmailSentAt !== null, "handoffEmailSentAt claimed");
  const again = await confirmFoundingPayment(prisma, billing, operatorId, {
    subscriptionId: `sub_test_${operatorId}`,
    livemode: false,
  });
  assert(again.handoffEmail.sent === false && again.handoffEmail.reason === "already-sent", "a webhook retry never sends it twice");
  st = await state(operatorId);
  assert(st.paid === "pass", "paid is green");

  delete process.env.SEND_TEST_HANDOFF_EMAIL;

  console.log("3) Booking link added, Instagram connected:");
  await prisma.operator.update({ where: { id: operatorId }, data: { bookingLinkUrl: "https://calendly.com/juniper/interview" } });
  const channel = await prisma.channelConnection.findFirstOrThrow({ where: { operatorId, provider: "instagram" } });
  await connectChannel(
    prisma,
    {
      mode: "manychat" as const,
      async connect() {
        return { status: "connected" as const };
      },
      async sendMessage() {
        throw new Error("unused");
      },
      async status() {
        return { status: "connected" as const };
      },
    },
    channel.id,
  );
  st = await state(operatorId);
  s = (await getSetupSummary(prisma, operatorId))!;
  assert(st.bookingLink === "pass" && st.instagram === "pass", "booking link and Instagram are green");
  assert(st.webhook === "fail" && !s.readyToGoLive, "still NOT ready: no candidate has reached AFRA (the webhook is unproven)");

  console.log("4) Test DM: a candidate comes in through the webhook:");
  await ingestScreeningResult(prisma, { locationId: s.locations[0].id, name: "Test Candidate", contact: "@tester", outcome: "passed" });
  s = (await getSetupSummary(prisma, operatorId))!;
  st = await state(operatorId);
  assert(st.webhook === "pass" && s.candidateCount === 1, "webhook is green once one candidate exists");
  assert(s.readyToGoLive, "every automatic check is green: ready to go live");

  await prisma.operator.deleteMany({ where: { email: EMAIL } });
  console.log("\nSetup checker smoke test PASSED.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma?.$disconnect());
