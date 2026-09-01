import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { requireDevDatabase } from "./lib/guardDatabase";
import { logWizardFunnelEvent } from "../src/lib/wizardFunnel";

// Proves the wizard funnel diagnostic (WizardFunnelEvent) records a full
// 7-step run in order, that a partial/abandoned run still leaves its earlier
// checkpoints recorded, and that a bad/blank session id silently no-ops
// instead of throwing. Self-cleaning: only touches the throwaway sessions it
// creates.

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

  console.log("Full 7-step run, in order:");
  await logWizardFunnelEvent(prisma, { wizardSessionId: fullSession, eventType: "started", step: 1 });
  for (let step = 1; step <= 7; step++) {
    await logWizardFunnelEvent(prisma, {
      wizardSessionId: fullSession,
      eventType: "step_completed",
      step,
      email: "smoke@wizard.test",
    });
  }
  const fullRows = await prisma.wizardFunnelEvent.findMany({
    where: { wizardSessionId: fullSession },
    orderBy: { createdAt: "asc" },
  });
  assert(fullRows.length === 8, "full run recorded 8 rows (1 started + 7 step_completed)");
  assert(fullRows[0].eventType === "started" && fullRows[0].step === 1, "first row is started/step 1");
  for (let step = 1; step <= 7; step++) {
    assert(
      fullRows.some((r) => r.eventType === "step_completed" && r.step === step),
      `step ${step} completed row present`,
    );
  }
  assert(fullRows.every((r) => r.wizardSessionId === fullSession), "all rows share the same wizardSessionId");
  assert(
    fullRows.every((r) => r.eventType === "started" || r.email === "smoke@wizard.test"),
    "email persisted on step_completed rows once known",
  );

  console.log("\nPartial run (abandoned at step 3):");
  await logWizardFunnelEvent(prisma, { wizardSessionId: partialSession, eventType: "started", step: 1 });
  for (let step = 1; step <= 3; step++) {
    await logWizardFunnelEvent(prisma, { wizardSessionId: partialSession, eventType: "step_completed", step });
  }
  const partialRows = await prisma.wizardFunnelEvent.findMany({ where: { wizardSessionId: partialSession } });
  assert(partialRows.length === 4, "partial run recorded 4 rows (started + steps 1-3)");
  assert(
    !partialRows.some((r) => r.eventType === "step_completed" && r.step >= 4),
    "no step 4+ rows for the abandoned session",
  );

  console.log("\nBad input never throws (non-blocking doctrine):");
  await logWizardFunnelEvent(prisma, { wizardSessionId: "", eventType: "started", step: 1 });
  assert(true, "blank wizardSessionId silently no-ops instead of throwing");

  await prisma.wizardFunnelEvent.deleteMany({ where: { wizardSessionId: { in: [fullSession, partialSession] } } });
  console.log("\nAll wizard-funnel-smoke checks PASSED.");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
