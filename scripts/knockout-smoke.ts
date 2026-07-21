import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { ingestScreeningResult } from "../src/lib/manychat";
import { isValidPayload } from "../src/app/api/manychat/webhook/route";
import { provision } from "../src/lib/provision";

// Proves the real DB wiring behind the disqualifier/content pass: the same
// candidate answer disqualifies for one operator and not another depending
// on what that operator selected (real ingestScreeningResult calls, not just
// the pure evaluateDisqualification logic — that's covered in
// screening-questions-smoke.ts), an explicit `outcome` in the ingest payload
// always wins over computation (backward compat with the live ManyChat
// flow), a multi-role operator's assembled flow really does include the
// role-interest question at real ingest time, and the webhook-shaped
// payload validation rejects an unscorable call. Creates throwaway operators
// and deletes them afterward (cascade) — same self-cleaning pattern as the
// other *-smoke scripts.

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!) });

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function main() {
  console.log("1-3) ingestScreeningResult — real DB, operator-conditional scoring + outcome fallback:");
  const emailA = "knockout-a@smoke.test";
  const emailB = "knockout-b@smoke.test";
  const emailC = "knockout-c@smoke.test";
  await prisma.operator.deleteMany({ where: { email: { in: [emailA, emailB, emailC] } } });

  const { operatorId: opAId, operator: opA } = await provision(prisma, {
    instagramHandle: "@knockouta",
    role: { title: "Front of House" },
    calendarChoice: "google",
    operatorEmail: emailA,
    disqualifiers: ["no_transportation"],
  });
  const { operatorId: opBId, operator: opB } = await provision(prisma, {
    instagramHandle: "@knockoutb",
    role: { title: "Front of House" },
    calendarChoice: "google",
    operatorEmail: emailB,
    disqualifiers: [],
  });

  const locationA = opA.locations[0];
  const roleA = locationA.roles[0];
  const locationB = opB.locations[0];
  const roleB = locationB.roles[0];

  // No outcome in the payload -> computed server-side. Same answer
  // (ko_no_transportation=B), different result per operator's configured
  // disqualifiers.
  const resultA = await ingestScreeningResult(prisma, {
    locationId: locationA.id,
    roleId: roleA.id,
    contact: "candidate_knockout_1",
    answers: { work_auth: "A", ko_no_transportation: "B" },
  });
  assert(resultA.ok && resultA.stage === "rejected", "operator A (selected no_transportation): candidate rejected");

  const resultB = await ingestScreeningResult(prisma, {
    locationId: locationB.id,
    roleId: roleB.id,
    contact: "candidate_knockout_2",
    answers: { work_auth: "A", ko_no_transportation: "B" },
  });
  assert(resultB.ok && resultB.stage === "screened", "operator B (did NOT select no_transportation): same answer, candidate screened (passed)");

  // Explicit outcome always wins, even when it contradicts what computation
  // would produce — backward compat with the live ManyChat flow, which still
  // sends its own pre-computed outcome today.
  const resultOverride = await ingestScreeningResult(prisma, {
    locationId: locationA.id,
    roleId: roleA.id,
    contact: "candidate_knockout_3",
    answers: { work_auth: "A", ko_no_transportation: "B" }, // would compute "failed" for operator A
    outcome: "passed", // explicit — must win
  });
  assert(resultOverride.ok && resultOverride.stage === "screened", "explicit outcome overrides computed scoring");

  console.log("\n4) multi-role operator's assembled flow includes role-select at real ingest time:");
  const { operatorId: opCId, operator: opC } = await provision(prisma, {
    instagramHandle: "@knockoutc",
    role: { title: "Front of House" },
    roles: [{ title: "Front of House" }, { title: "Back of House" }],
    calendarChoice: "google",
    operatorEmail: emailC,
    disqualifiers: [],
  });
  const locationC = opC.locations[0];
  const roleC = locationC.roles[0];
  const resultC = await ingestScreeningResult(prisma, {
    locationId: locationC.id,
    roleId: roleC.id,
    contact: "candidate_knockout_4",
    answers: { work_auth: "A", role_select: "Back of House" },
  });
  assert(resultC.ok, "ingest succeeds for a multi-role operator");
  const conversationC = await prisma.conversation.findFirst({ where: { candidateId: resultC.ok ? resultC.candidateId : "" } });
  const snapshotC = (conversationC?.transcript as { questionSnapshot?: { key: string; answerLabel: string }[] } | null)
    ?.questionSnapshot;
  assert(
    snapshotC?.some((s) => s.key === "role_select" && s.answerLabel === "Back of House") === true,
    "role-select answer is decoded and snapshotted — proves buildAssembledQuestions really included it, driven by the real distinct-role-titles query",
  );

  console.log("\n5) webhook payload validation rejects an unscorable call:");
  assert(
    isValidPayload({ locationId: "loc_1" }) === false,
    "neither outcome nor answers present -> rejected (nothing to score from)",
  );
  assert(
    isValidPayload({ locationId: "loc_1", outcome: "passed" }) === true,
    "outcome alone is still valid (backward compat, no answers required)",
  );
  assert(
    isValidPayload({ locationId: "loc_1", answers: { work_auth: "A" } }) === true,
    "answers alone is valid (outcome now optional)",
  );
  assert(
    isValidPayload({ locationId: "loc_1", outcome: "maybe" }) === false,
    "an invalid outcome value is still rejected outright",
  );

  await prisma.operator.delete({ where: { id: opAId } });
  await prisma.operator.delete({ where: { id: opBId } });
  await prisma.operator.delete({ where: { id: opCId } });
  console.log("\nKnockout smoke test PASSED.");
}

main()
  .catch((e) => {
    console.error("\n" + e.message);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
