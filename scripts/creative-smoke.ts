import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { validateCreativeText } from "../src/lib/creative";
import { provision } from "../src/lib/provision";
import { isValidTemplate } from "../src/lib/readiness";

// Step 5 proof: the compliance guard blocks non-compliant text with a plain
// reason and passes clean text; saved edits persist via the existing template
// contract and isValidTemplate() still holds.

const prisma = new PrismaClient({
  adapter: new PrismaPg(process.env.DATABASE_URL!),
});

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function main() {
  console.log("1) validateCreativeText blocks non-compliant text:");
  const bad = validateCreativeText({
    headline: "Looking for young servers under 25",
    roleLabel: "Server",
    payLabel: "$15/hr",
    cta: "Apply now",
  });
  console.log(`   ok=${bad.ok} violations=${bad.violations.length}`);
  for (const v of bad.violations) console.log(`     - [${v.category}] ${v.field}: "${v.match}" → ${v.reason}`);
  assert(bad.ok === false, "bad string is rejected (ok=false)");
  assert(bad.violations.some((v) => v.category === "age"), "flags an AGE violation");
  assert(
    bad.violations.some((v) => v.match.toLowerCase() === "young") &&
      bad.violations.some((v) => /under\s+25/i.test(v.match)),
    "catches both 'young' and 'under 25'",
  );
  assert(
    bad.violations.every((v) => v.reason.length > 10 && !/regex|pattern|null/i.test(v.reason)),
    "every reason is plain-language (no jargon)",
  );

  console.log("\n   more bad strings:");
  for (const [text, cat] of [
    ["Female bartenders only", "gender"],
    ["Must be a US citizen only", "eligibility"],
    ["No kids please", "family_status"],
  ] as const) {
    const r = validateCreativeText({ headline: text, roleLabel: "x", payLabel: "$1", cta: "" });
    assert(!r.ok && r.violations.some((v) => v.category === cat), `"${text}" → ${cat} violation`);
  }

  console.log("\n2) validateCreativeText passes clean text:");
  const good = validateCreativeText({
    headline: "Now Hiring — Friendly Team",
    roleLabel: "Server",
    payLabel: "$18/hr",
    cta: "Tap to apply — quick chat, no resume needed.",
  });
  console.log(`   ok=${good.ok} violations=${good.violations.length}`);
  assert(good.ok === true, "clean string is accepted (ok=true)");
  assert(good.violations.length === 0, "no violations on clean text");

  console.log("\n3) saved edits persist via the template contract; isValidTemplate holds:");
  const email = "creative@smoke.test";
  await prisma.operator.deleteMany({ where: { email } });
  const { operatorId } = await provision(
    prisma,
    { instagramHandle: "@creativesmoke", role: { title: "Server", pay: "$18/hr" }, calendarChoice: "google", operatorEmail: email },
    { startTrial: false },
  );
  const role = await prisma.role.findFirstOrThrow({ where: { location: { operatorId } } });

  // Simulate a save of clean edits (the action validates the same way).
  const tmpl = await prisma.screeningTemplate.findUniqueOrThrow({ where: { roleId: role.id } });
  const edited = { ...(tmpl.slots as Record<string, unknown>), headline: "Join Our Crew", payLabel: "$19/hr" };
  assert(validateCreativeText(edited).ok, "edited slots pass validation before persist");
  await prisma.screeningTemplate.update({ where: { roleId: role.id }, data: { slots: edited } });

  const after = await prisma.screeningTemplate.findUniqueOrThrow({ where: { roleId: role.id } });
  const afterSlots = after.slots as Record<string, string>;
  assert(afterSlots.headline === "Join Our Crew", "edited headline persisted");
  assert(afterSlots.payLabel === "$19/hr", "edited pay persisted");
  assert(afterSlots.roleLabel === "Server", "identity (role) preserved");
  assert(isValidTemplate({ slots: afterSlots }) === true, "isValidTemplate() still holds after edit");

  await prisma.operator.delete({ where: { id: operatorId } });
  console.log("\nCreative smoke test PASSED.");
}

main()
  .catch((e) => {
    console.error("\n" + e.message);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
