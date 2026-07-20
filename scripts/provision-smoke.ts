import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { provision } from "../src/lib/provision";

// End-to-end proof of Step 2: provision -> read back -> confirm gates are honest.
// Creates a throwaway operator and deletes it afterward (cascade) so it's idempotent.

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function main() {
  const inputs = {
    instagramHandle: "@BlueBottleCoffee",
    role: { title: "Barista", pay: "$20/hr", hours: "Full-time" },
    calendarChoice: "google",
  };

  // Clean any prior run for this synthetic operator.
  await prisma.operator.deleteMany({
    where: { email: "bluebottlecoffee@pending.afra.local" },
  });

  console.log("provision(inputs) ->");
  const { operatorId } = await provision(prisma, inputs);
  console.log(`  operatorId = ${operatorId}`);

  // Read back the full tree.
  const op = await prisma.operator.findUniqueOrThrow({
    where: { id: operatorId },
    include: {
      channelConnections: true,
      locations: {
        include: {
          calendarConnections: true,
          roles: { include: { screeningTemplate: true } },
        },
      },
    },
  });

  console.log("\nTree:");
  const loc = op.locations[0];
  const role = loc.roles[0];
  const tmpl = role.screeningTemplate!;
  const channel = op.channelConnections[0];
  const calendar = loc.calendarConnections[0];
  console.log(`  Operator: ${op.name} <${op.email}> billing=${op.billingStatus}`);
  console.log(`  Location: ${loc.name} tz=${loc.timezone}`);
  console.log(`  Role: ${role.title} payText=${role.payText} payRate=${role.payRate}/${role.payPeriod} hours=${role.hours}`);
  console.log(`  Template: "${tmpl.name}" source=${tmpl.sourceTemplateId} photoRef=${tmpl.photoRef}`);
  console.log(`            slots=${JSON.stringify(tmpl.slots)}`);
  console.log(`  Channel: ${channel.provider} ${channel.handle} status=${channel.status}`);
  console.log(`  Calendar: ${calendar.provider} status=${calendar.status}`);
  console.log(`  Readiness: state=${role.readinessState} gates(plat=${role.gatePlatform},cal=${role.gateCalendar},tmpl=${role.gateTemplate},bill=${role.gateBilling})`);

  console.log("\nAssertions — structure:");
  assert(!!operatorId, "provision returned an operator id");
  assert(op.locations.length === 1, "exactly one default Location created");
  assert(loc.roles.length === 1, "exactly one Role created");
  assert(!!tmpl, "ScreeningTemplate attached to the Role");
  assert(tmpl.sourceTemplateId !== null, "template records which system default it was cloned from");
  assert(tmpl.photoRef !== null, "template carries a photoRef (Level-3 swap target)");
  const slots = tmpl.slots as Record<string, unknown>;
  assert(slots.roleLabel === "Barista", "cloned slots overridden with role title");
  assert(slots.payLabel === "$20/hr", "cloned slots overridden with pay label");
  assert(role.payRate === 20 && role.payPeriod === "hour", "pay string parsed to structured rate/period");
  assert(channel.status === "stubbed", "ChannelConnection is stubbed");
  assert(calendar.status === "stubbed", "CalendarConnection is stubbed");
  assert(op.billingStatus === "trialing", "billing advanced to trialing (provision starts the trial)");

  console.log("\nAssertions — HONEST gates (the critical rule):");
  assert(role.gatePlatform === false, "gatePlatform is FALSE because channel is stubbed");
  assert(role.gateCalendar === false, "gateCalendar is FALSE because calendar is stubbed");
  assert(role.gateTemplate === true, "gateTemplate is TRUE (valid cloned template)");
  assert(role.gateBilling === true, "gateBilling is TRUE (trial active) — via evaluateReadiness");
  assert(role.readinessState !== "live", "instance reads NOT live (channel+calendar stubbed)");
  assert(role.readinessState === "ready", "state is 'ready' = configured, awaiting live deps");

  // Cleanup — remove the throwaway operator (cascade).
  await prisma.operator.delete({ where: { id: operatorId } });
  console.log("\nCleaned up throwaway operator. Smoke test PASSED.");
}

main()
  .catch((e) => {
    console.error("\n" + e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
