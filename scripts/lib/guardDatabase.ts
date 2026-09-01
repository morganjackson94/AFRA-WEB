import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";

// Every local script must call requireDevDatabase() before doing anything
// else, instead of constructing its own PrismaClient from DATABASE_URL. See
// docs/DATABASE.md for the incident this closes: local dev and all smoke
// scripts used to read DATABASE_URL directly (.env's production value) with
// no environment check, so a whole session's worth of test operators,
// backdated createdAt values, and Stripe test-clock work landed in real
// production data without anyone deciding to run anything against it.
//
// Two independent layers, both must pass:
//   1. DEV_DATABASE_URL must be explicitly set. No fallback to DATABASE_URL
//      — the silent fallback is exactly the bug above.
//   2. Even with DEV_DATABASE_URL set, refuse if the target database
//      carries the ProductionMarker row (see schema.prisma). Host-string
//      matching alone isn't reliable: production's Prisma Postgres resource
//      and the separate dev one both live on db.prisma.io, distinguished
//      only by credentials in the connection string, not by host.

export async function requireDevDatabase(): Promise<PrismaClient> {
  const url = process.env.DEV_DATABASE_URL;
  if (!url) {
    console.error(
      "\nREFUSING TO RUN: DEV_DATABASE_URL is not set.\n" +
        "This script would otherwise need to fall back to DATABASE_URL, which is\n" +
        "production (see .env / docs/DATABASE.md). Set DEV_DATABASE_URL in your\n" +
        "shell or .env.local before running this script.\n",
    );
    process.exit(1);
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg(url) });

  const marker = await prisma.productionMarker.findFirst();
  if (marker) {
    console.error(
      "\nREFUSING TO RUN: DEV_DATABASE_URL points at a database carrying the\n" +
        "production marker row (see ProductionMarker in schema.prisma). This\n" +
        "script only runs against a genuine dev database. See docs/DATABASE.md.\n",
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  return prisma;
}
