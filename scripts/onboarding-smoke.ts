import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import { describeReadiness } from "../src/lib/dashboard";
import { provision } from "../src/lib/provision";

// Proves the onboarding -> provision -> DB -> dashboard chain with the exact
// input shape the wizard collects (handle, role title, pay, calendarChoice,
// optional email). The dashboard copy SSOT must read NOT live (stubbed).

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! }),
});

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function main() {
  const email = "onboard@smoke.test";
  await prisma.operator.deleteMany({ where: { email } });

  // Exactly what startOnboardingAction passes to provision() from form input.
  const formInput = {
    instagramHandle: "@taqueriademo",
    role: { title: "Front of House", pay: "$16–18 / hr" },
    calendarChoice: "google",
    operatorEmail: email,
  };

  console.log("Completing onboarding (form input -> provision()):");
  const { operatorId } = await provision(prisma, formInput);
  console.log(`  operatorId = ${operatorId}`);

  // Real DB row exists with the full tree.
  const op = await prisma.operator.findUniqueOrThrow({
    where: { id: operatorId },
    include: {
      channelConnections: true,
      locations: { include: { calendarConnections: true, roles: { include: { screeningTemplate: true } } } },
    },
  });
  const role = op.locations[0].roles[0];

  assert(op.email === email, "operator created with the real onboarding email");
  assert(op.channelConnections[0].handle === "@taqueriademo", "Instagram handle captured on the channel");
  assert(op.channelConnections[0].status === "stubbed", "channel is stubbed (no real OAuth)");
  assert(op.locations[0].calendarConnections[0].provider === "google", "calendar choice mapped to provider");
  assert(op.locations[0].calendarConnections[0].status === "stubbed", "calendar is stubbed (no real OAuth)");
  assert(role.title === "Front of House", "role title from the picker");
  assert(role.payText === "$16–18 / hr", "pay text captured");
  assert(op.billingStatus === "trialing", "trial started (billing trialing)");

  // Dashboard copy SSOT must read NOT live.
  const display = describeReadiness(role);
  console.log(`  dashboard reads: "${display.headline}" (accepting=${display.acceptingApplicants})`);
  assert(role.readinessState === "ready", "readinessState is 'ready' (not live)");
  assert(display.acceptingApplicants === false, "dashboard says NOT accepting applicants");
  assert(!/you're live/i.test(display.headline), "dashboard never says 'You're live'");

  await prisma.operator.delete({ where: { id: operatorId } });
  console.log("\nOnboarding chain smoke test PASSED.");
}

main()
  .catch((e) => {
    console.error("\n" + e.message);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
