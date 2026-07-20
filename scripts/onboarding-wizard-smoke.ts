import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { deleteDraft, loadDraft, saveDraft } from "../src/lib/onboardingDraft";
import { provision } from "../src/lib/provision";
import { locationCountForBucket } from "../src/lib/qualification";

// Proves the Onboarding Wizard redesign's new capabilities: multi-location +
// multi-role provisioning, the Facebook channel, disqualifiers/badHireText
// persistence, and OnboardingDraft save/restricted-detection/load/delete.
// Creates throwaway records and deletes them afterward (cascade), same
// self-cleaning pattern as the other *-smoke scripts.

const prisma = new PrismaClient({
  adapter: new PrismaPg(process.env.DATABASE_URL!),
});

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function main() {
  const email = "wizard@smoke.test";
  await prisma.operator.deleteMany({ where: { email } });
  await prisma.onboardingDraft.deleteMany({ where: { email } });

  console.log("locationCountForBucket mapping (lower bound of each bucket):");
  assert(locationCountForBucket("1-2") === 1, '"1-2" -> 1');
  assert(locationCountForBucket("3-5") === 3, '"3-5" -> 3');
  assert(locationCountForBucket("6-10") === 6, '"6-10" -> 6');
  assert(locationCountForBucket("11-15") === 11, '"11-15" -> 11');
  assert(locationCountForBucket("16+") === 16, '"16+" -> 16');

  console.log("\nOnboardingDraft — save, restricted-detection, load, delete:");
  const clear = await saveDraft(prisma, email, 1, { locationsBucket: "3-5" });
  assert(clear.restricted === false, "no primaryState yet -> not restricted");

  const stillClear = await saveDraft(prisma, email, 2, { primaryState: "TX", hasNycLocation: false });
  assert(stillClear.restricted === false, "TX is not a restricted jurisdiction");

  const loaded = await loadDraft(prisma, email);
  assert(loaded !== null, "draft found by email");
  assert(loaded!.step === 2, "draft resumes at the last-saved step");
  assert((loaded!.answers as Record<string, unknown>).primaryState === "TX", "draft answers persisted");

  const restricted = await saveDraft(prisma, email, 2, { primaryState: "IL", hasNycLocation: false });
  assert(restricted.restricted === true, "IL trips the same hard gate isRestrictedJurisdiction uses");

  const nyNotCity = await saveDraft(prisma, email, 2, { primaryState: "NY", hasNycLocation: false });
  assert(nyNotCity.restricted === false, "NY outside NYC is not restricted (city-scoped)");

  const nyCity = await saveDraft(prisma, email, 2, { primaryState: "NY", hasNycLocation: true });
  assert(nyCity.restricted === true, "NY + NYC location is restricted");

  await deleteDraft(prisma, email);
  const afterDelete = await loadDraft(prisma, email);
  assert(afterDelete === null, "deleteDraft removes the row (called on successful provision())");

  console.log("\nMulti-location + multi-role provisioning + Facebook channel + screener input:");
  const { operatorId } = await provision(prisma, {
    instagramHandle: "@wizardsmoke",
    facebookHandle: "wizardsmoke",
    role: { title: "Front of House" }, // singular fallback, unused when roles[] is set
    roles: [{ title: "Front of House", pay: "$17/hr" }, { title: "Barista", pay: "$17/hr" }],
    locationCount: 3,
    calendarChoice: "google",
    operatorEmail: email,
    disqualifiers: ["no_weekends", "no_food_handler_cert"],
    badHireText: "Hired on vibes alone, no food safety cert, out in a month.",
  });

  const op = await prisma.operator.findUniqueOrThrow({
    where: { id: operatorId },
    include: {
      channelConnections: true,
      locations: { include: { roles: { include: { screeningTemplate: true } } } },
    },
  });

  assert(op.locations.length === 3, "3 Locations created (not 1) for locationCount=3");
  for (const loc of op.locations) {
    assert(loc.roles.length === 2, `Location "${loc.name}" has both roles (2), not 1`);
    assert(
      loc.roles.every((r) => r.screeningTemplate !== null),
      `Location "${loc.name}" — every Role has its own cloned ScreeningTemplate`,
    );
  }
  assert(
    op.channelConnections.some((c) => c.provider === "instagram" && c.status === "stubbed"),
    "Instagram channel created (existing behavior unchanged)",
  );
  assert(
    op.channelConnections.some((c) => c.provider === "facebook" && c.handle === "wizardsmoke"),
    "Facebook channel created from facebookHandle",
  );
  assert(
    op.disqualifiers.length === 2 && op.disqualifiers.includes("no_food_handler_cert"),
    "disqualifiers persisted on Operator",
  );
  assert(op.badHireText?.includes("vibes alone") === true, "badHireText persisted on Operator");

  await prisma.operator.delete({ where: { id: operatorId } });
  console.log("\nOnboarding Wizard smoke test PASSED.");
}

main()
  .catch((e) => {
    console.error("\n" + e.message);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
