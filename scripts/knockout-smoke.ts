import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { ingestScreeningResult, isCleanManyChatPayload, translateCleanManyChatPayload } from "../src/lib/manychat";
import { isValidPayload, POST } from "../src/app/api/manychat/webhook/route";
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
  assert(
    resultA.ok && resultA.outcome === "unqualified",
    "outcome field (ManyChat N16's branch condition) is 'unqualified' for the rejected candidate",
  );

  const resultB = await ingestScreeningResult(prisma, {
    locationId: locationB.id,
    roleId: roleB.id,
    contact: "candidate_knockout_2",
    answers: { work_auth: "A", ko_no_transportation: "B" },
  });
  assert(resultB.ok && resultB.stage === "screened", "operator B (did NOT select no_transportation): same answer, candidate screened (passed)");
  assert(resultB.ok && resultB.outcome === "qualified", "outcome field is 'qualified' for the screened candidate");

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

  console.log("\n4b) the real HTTP route (not just ingestScreeningResult) returns outcome in its JSON body:");
  const secret = process.env.MANYCHAT_WEBHOOK_SECRET;
  if (!secret) {
    console.log("  (skipped — MANYCHAT_WEBHOOK_SECRET not set locally)");
  } else {
    const httpResponse = await POST(
      new Request("http://localhost/api/manychat/webhook", {
        method: "POST",
        headers: { "content-type": "application/json", "x-manychat-secret": secret },
        body: JSON.stringify({
          locationId: locationA.id,
          roleId: roleA.id,
          contact: "candidate_knockout_http",
          answers: { work_auth: "A", ko_no_transportation: "B" },
        }),
      }),
    );
    const httpBody = await httpResponse.json();
    console.log(`  sample response body: ${JSON.stringify(httpBody)}`);
    assert(httpResponse.status === 200, "real POST handler returns 200");
    assert(httpBody.outcome === "unqualified", "real HTTP JSON response body includes outcome (not just the internal function's return)");
    assert(typeof httpBody.candidateId === "string" && typeof httpBody.stage === "string", "candidateId/stage still present alongside outcome");
  }

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

  console.log("\n6) clean ManyChat payload translation (rename + invert + role resolution):");
  assert(
    isCleanManyChatPayload({ locationId: locationA.id, work_auth: true }) === true,
    "a top-level work_auth with no answers object is detected as the clean shape",
  );
  assert(
    isCleanManyChatPayload({ locationId: locationA.id, answers: { work_auth: "A" } }) === false,
    "the older internal shape (answers object present) is NOT detected as clean",
  );

  // 6a) Fully-available candidate — every ko_* true. Operator A has
  // no_transportation configured as a dealbreaker; since this candidate DOES
  // have transportation (and everything else), they must NOT be knocked out.
  // This is the exact assertion the brief asked for: all-true -> every
  // negative slug decodes to the non-disqualifying letter, and outcome is
  // "qualified".
  const qualifiedPayload = {
    locationId: locationA.id,
    work_auth: true,
    selected_role: "Front of House",
    ko_weekends: true,
    ko_evenings: true,
    ko_experience: true,
    ko_transport: true,
    ko_opening: true,
    ko_closing: true,
    ko_foodcert: true,
    ko_commitment: true,
    comp_1: "Two years at a busy brunch spot.",
    comp_2: "Stayed calm, apologized, fixed the order fast.",
    comp_3: "Triage the tickets, call for backup, communicate wait times.",
    cand_name: "Jane Doe",
    cand_email: "jane@example.com",
  };
  const translatedQualified = await translateCleanManyChatPayload(prisma, qualifiedPayload);
  assert(translatedQualified.ok, "translation succeeds for the all-true payload");
  if (translatedQualified.ok) {
    const a = translatedQualified.payload.answers!;
    const negativeSlugs = [
      "ko_no_weekends",
      "ko_no_evenings",
      "ko_under_6mo_experience",
      "ko_no_transportation",
      "ko_cant_open",
      "ko_cant_close",
      "ko_no_food_handler_cert",
      "ko_wont_commit_3mo",
    ];
    assert(
      negativeSlugs.every((slug) => a[slug] === "A"),
      "every negative-named slug decodes to 'A' (the non-disqualifying letter) when its clean field was true",
    );
    assert(a.work_auth === "A", "work_auth translates true -> 'A'");
    assert(a.role_select === "Front of House", "role_select carries the resolved role title");
    assert(a.foh_1_experience && a.foh_2_service_instincts && a.foh_3_pressure ? true : false, "comp_1/2/3 mapped onto the FOH competency slugs (resolved role is FOH)");
  }

  let qualifiedHttpBody: unknown;
  let knockedOutHttpBody: unknown;
  if (secret) {
    const qualifiedRes = await POST(
      new Request("http://localhost/api/manychat/webhook", {
        method: "POST",
        headers: { "content-type": "application/json", "x-manychat-secret": secret },
        body: JSON.stringify({ ...qualifiedPayload, cand_email: "jane.qualified@example.com" }),
      }),
    );
    qualifiedHttpBody = await qualifiedRes.json();
    assert(qualifiedRes.status === 200, "clean-payload qualified request -> HTTP 200");
    assert((qualifiedHttpBody as { outcome?: string }).outcome === "qualified", "clean-payload qualified request -> outcome: 'qualified'");

    // 6b) Same operator, one field flipped: ko_transport: false. Operator A's
    // one configured dealbreaker is no_transportation, so this candidate —
    // otherwise identical — must be knocked out.
    const knockedOutPayload = { ...qualifiedPayload, ko_transport: false, cand_email: "jane.knockedout@example.com" };
    const knockedOutRes = await POST(
      new Request("http://localhost/api/manychat/webhook", {
        method: "POST",
        headers: { "content-type": "application/json", "x-manychat-secret": secret },
        body: JSON.stringify(knockedOutPayload),
      }),
    );
    knockedOutHttpBody = await knockedOutRes.json();
    assert(knockedOutRes.status === 200, "clean-payload knocked-out request -> HTTP 200");
    assert((knockedOutHttpBody as { outcome?: string }).outcome === "unqualified", "clean-payload knocked-out request (ko_transport: false) -> outcome: 'unqualified'");

    console.log(`\n  QUALIFIED sample response:   ${JSON.stringify(qualifiedHttpBody)}`);
    console.log(`  KNOCKED-OUT sample response: ${JSON.stringify(knockedOutHttpBody)}`);
  } else {
    console.log("  (HTTP round-trip skipped — MANYCHAT_WEBHOOK_SECRET not set locally; translation itself still verified above)");
  }

  // 6c) A role name that doesn't exist at this location is a hard 4xx, not a
  // silent fallback to the wrong competency set.
  const badRole = await translateCleanManyChatPayload(prisma, { ...qualifiedPayload, selected_role: "Assistant Manager" });
  assert(badRole.ok === false, "an unresolvable selected_role is rejected outright, not silently defaulted");

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
