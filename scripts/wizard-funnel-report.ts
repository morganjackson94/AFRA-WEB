import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { requireDevDatabase } from "./lib/guardDatabase";

// Read path for the onboarding-wizard funnel diagnostic (WizardFunnelEvent —
// see schema.prisma / src/lib/wizardFunnel.ts). Pure read, no side effects.
// Run any time with: npm run wizard-funnel:report

let prisma: PrismaClient;

const STEP_NAMES = [
  "locations",
  "market",
  "roles",
  "price_checkpoint",
  "disqualifiers",
  "social_handles",
  "checkout",
];

async function main() {
  prisma = await requireDevDatabase();

  const started = await prisma.wizardFunnelEvent.count({ where: { eventType: "started" } });

  console.log("Onboarding wizard funnel");
  console.log("========================");
  console.log(`Wizard started (landed on step 1): ${started}`);

  let prevCount = started;
  for (let step = 1; step <= 7; step++) {
    const count = await prisma.wizardFunnelEvent.count({ where: { eventType: "step_completed", step } });
    const pctOfStarted = started > 0 ? Math.round((count / started) * 100) : 0;
    const dropFromPrev = prevCount > 0 ? Math.round(((prevCount - count) / prevCount) * 100) : 0;
    console.log(
      `Step ${step} (${STEP_NAMES[step - 1]}) completed: ${count}` +
        `  [${pctOfStarted}% of started, ${dropFromPrev}% drop from previous step]`,
    );
    prevCount = count;
  }

  // Downstream of the wizard entirely (Event/Operator tables) — for context,
  // not part of the WizardFunnelEvent table itself.
  const operators = await prisma.operator.count();
  const startedSetupEvents = await prisma.event.count({ where: { type: "StartedSetup" } });
  const wentLiveEvents = await prisma.event.count({ where: { type: "WentLive" } });
  console.log("\nDownstream, for context (not from WizardFunnelEvent):");
  console.log(`Operators created (provision() succeeded, ~= reached checkout): ${operators}`);
  console.log(`StartedSetup events: ${startedSetupEvents}`);
  console.log(`WentLive events: ${wentLiveEvents}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
