import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { DEFAULT_BUSINESS_HOURS } from "../src/lib/constants";
import { evaluateReadiness } from "../src/lib/readiness";
import { ensureSystemDefaultTemplate, SYSTEM_DEFAULT_TEMPLATE } from "../src/lib/templates";

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  // Idempotent: clear prior seed data so re-running stays clean.
  await prisma.operator.deleteMany({ where: { email: "owner@sandoitchi.com" } });
  await prisma.screeningTemplate.deleteMany({ where: { isSystemDefault: true } });

  // 1) System-default template library (roleId = null).
  const systemDefault = await ensureSystemDefaultTemplate(prisma);

  // 2) Operator: Sandoitchi, with two first-class locations + a stubbed channel.
  const sandoitchi = await prisma.operator.create({
    data: {
      name: "Sandoitchi",
      email: "owner@sandoitchi.com",
      billingStatus: "none",
      locations: {
        create: [
          {
            name: "Sandoitchi — Dallas",
            address: "1500 Main St, Dallas, TX 75201",
            timezone: "America/Chicago",
            businessHours: DEFAULT_BUSINESS_HOURS,
          },
          {
            name: "Sandoitchi — Denver",
            address: "800 16th St, Denver, CO 80202",
            timezone: "America/Denver",
            businessHours: DEFAULT_BUSINESS_HOURS,
          },
        ],
      },
      // Stubbed messaging channel — real token lands with B1 (post App Review).
      channelConnections: {
        create: [{ provider: "instagram", handle: "@sandoitchi", status: "stubbed" }],
      },
    },
    include: { locations: true },
  });

  const dallas = sandoitchi.locations.find((l) => l.name.includes("Dallas"))!;
  const denver = sandoitchi.locations.find((l) => l.name.includes("Denver"))!;

  // Stubbed calendar per location — real token lands with B2 (post Google verify).
  await prisma.calendarConnection.createMany({
    data: [
      { locationId: dallas.id, provider: "google", status: "stubbed" },
      { locationId: denver.id, provider: "google", status: "stubbed" },
    ],
  });

  // 3) One Role at the Dallas location, with a template cloned from the default.
  const role = await prisma.role.create({
    data: {
      locationId: dallas.id,
      title: "Sandwich Artist",
      payText: "$18/hr",
      payRate: 18,
      payPeriod: "hour",
      hours: "Part-time, 20-30 hrs/wk",
      screeningTemplate: {
        create: {
          name: "Sandwich Artist — Dallas",
          sourceTemplateId: systemDefault.id,
          slots: {
            ...SYSTEM_DEFAULT_TEMPLATE.slots,
            roleLabel: "Sandwich Artist",
            payLabel: "$18/hr",
          },
          photoRef: SYSTEM_DEFAULT_TEMPLATE.photoRef,
        },
      },
    },
    include: { screeningTemplate: true },
  });

  // Honest gates via the single source of truth (channel + calendar stubbed,
  // billing none) — never set ad hoc.
  const readiness = evaluateReadiness({
    channelStatus: "stubbed",
    calendarStatus: "stubbed",
    template: role.screeningTemplate,
    billingStatus: "none",
  });
  await prisma.role.update({ where: { id: role.id }, data: readiness });

  // Summary
  const counts = {
    operators: await prisma.operator.count(),
    locations: await prisma.location.count(),
    roles: await prisma.role.count(),
    screeningTemplates: await prisma.screeningTemplate.count(),
    channelConnections: await prisma.channelConnection.count(),
    calendarConnections: await prisma.calendarConnection.count(),
  };
  console.log("Seed complete:", counts, "| Dallas role readiness:", readiness.readinessState);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
