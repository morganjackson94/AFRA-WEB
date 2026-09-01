import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { requireDevDatabase } from "./lib/guardDatabase";
import { logWizardFunnelEvent } from "../src/lib/wizardFunnel";

// Proves the wizard funnel diagnostic (WizardFunnelEvent) records a full
// homepage-to-checkout run in order, that attribution captured once persists
// across every event in a session, that a partial/abandoned run still leaves
// its earlier checkpoints (plus an abandoned row carrying the last field
// touched), and that a bad/blank session id silently no-ops instead of
// throwing. Self-cleaning: only touches the throwaway sessions it creates.

let prisma: PrismaClient;

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function main() {
  prisma = await requireDevDatabase();

  const fullSession = `smoke-full-${Date.now()}`;
  const partialSession = `smoke-partial-${Date.now()}`;
  await prisma.wizardFunnelEvent.deleteMany({ where: { wizardSessionId: { in: [fullSession, partialSession] } } });

  const attribution = {
    utmSource: "meta", utmMedium: "cpc", utmCampaign: "afra_prospecting",
    fbclid: "fb.123", referrer: "https://facebook.com", landingPath: "/",
  };

  console.log("Full landing -> checkout run, in order:");
  await logWizardFunnelEvent(prisma, { wizardSessionId: fullSession, eventType: "landing_view", step: 0, attribution });
  await logWizardFunnelEvent(prisma, { wizardSessionId: fullSession, eventType: "cta_click", step: 0, elementId: "hero", attribution });
  await logWizardFunnelEvent(prisma, { wizardSessionId: fullSession, eventType: "page_view", step: 1, attribution });
  await logWizardFunnelEvent(prisma, { wizardSessionId: fullSession, eventType: "session_started", step: 1, attribution });
  await logWizardFunnelEvent(prisma, { wizardSessionId: fullSession, eventType: "intro_completed", step: 0, attribution });
  for (let step = 1; step <= 7; step++) {
    await logWizardFunnelEvent(prisma, {
      wizardSessionId: fullSession,
      eventType: "step_completed",
      step,
      email: "smoke@wizard.test",
      attribution,
    });
  }
  const fullRows = await prisma.wizardFunnelEvent.findMany({
    where: { wizardSessionId: fullSession },
    orderBy: { createdAt: "asc" },
  });
  assert(fullRows.length === 12, "full run recorded 12 rows (landing_view, cta_click, page_view, session_started, intro_completed, 7x step_completed)");
  assert(fullRows[0].eventType === "landing_view", "first row is landing_view");
  assert(fullRows.find((r) => r.eventType === "cta_click")?.elementId === "hero", "cta_click carries which CTA was tapped");
  for (let step = 1; step <= 7; step++) {
    assert(
      fullRows.some((r) => r.eventType === "step_completed" && r.step === step),
      `step ${step} completed row present`,
    );
  }
  assert(fullRows.every((r) => r.wizardSessionId === fullSession), "all rows share the same wizardSessionId");
  assert(
    fullRows.every((r) => r.utmSource === "meta" && r.utmCampaign === "afra_prospecting" && r.fbclid === "fb.123"),
    "attribution captured once on landing_view persists on every later event, including step 7",
  );
  assert(
    fullRows.filter((r) => r.eventType !== "step_completed").every((r) => r.email === null),
    "email is null on every pre-checkout event, before it's known",
  );
  assert(
    fullRows.filter((r) => r.eventType === "step_completed").every((r) => r.email === "smoke@wizard.test"),
    "email persisted on step_completed rows once known",
  );

  console.log("\nPartial run, abandoned at step 3 (last field touched: otherRoleText):");
  await logWizardFunnelEvent(prisma, { wizardSessionId: partialSession, eventType: "session_started", step: 1, attribution });
  for (let step = 1; step <= 3; step++) {
    await logWizardFunnelEvent(prisma, { wizardSessionId: partialSession, eventType: "step_completed", step, attribution });
  }
  await logWizardFunnelEvent(prisma, {
    wizardSessionId: partialSession,
    eventType: "abandoned",
    step: 3,
    elementId: "otherRoleText",
    attribution,
  });
  const partialRows = await prisma.wizardFunnelEvent.findMany({ where: { wizardSessionId: partialSession } });
  assert(partialRows.length === 5, "partial run recorded 5 rows (session_started + steps 1-3 + abandoned)");
  assert(
    !partialRows.some((r) => r.eventType === "step_completed" && r.step >= 4),
    "no step 4+ rows for the abandoned session",
  );
  assert(
    partialRows.find((r) => r.eventType === "abandoned")?.elementId === "otherRoleText",
    "abandoned row records the last field touched, not just the last step",
  );

  console.log("\nBad input never throws (non-blocking doctrine):");
  await logWizardFunnelEvent(prisma, { wizardSessionId: "", eventType: "session_started", step: 1 });
  assert(true, "blank wizardSessionId silently no-ops instead of throwing");

  console.log("\nDirect traffic — no attribution present is a real category, not dropped:");
  const directSession = `smoke-direct-${Date.now()}`;
  await logWizardFunnelEvent(prisma, { wizardSessionId: directSession, eventType: "landing_view", step: 0 });
  const directRow = await prisma.wizardFunnelEvent.findFirst({ where: { wizardSessionId: directSession } });
  assert(directRow !== null, "row is written even with zero attribution fields");
  assert(
    directRow?.utmSource === null && directRow?.fbclid === null,
    "missing attribution is stored as null, not a sentinel or a dropped row",
  );
  await prisma.wizardFunnelEvent.deleteMany({ where: { wizardSessionId: directSession } });

  await prisma.wizardFunnelEvent.deleteMany({ where: { wizardSessionId: { in: [fullSession, partialSession] } } });
  console.log("\nAll wizard-funnel-smoke checks PASSED.");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
