import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

// Prisma 7 requires a driver adapter (no more datasource URL on the client).
// DATABASE_URL is the POOLED connection (PgBouncer/provider pooler) — this is
// the runtime query path, which under Vercel serverless can spin up many
// concurrent connections; pooling keeps that from exhausting Postgres's
// connection limit. Migrations use the separate unpooled DIRECT_URL instead
// (see prisma.config.ts) since DDL/advisory locks don't play well with
// transaction-mode pooling.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient() {
  const adapter = new PrismaPg(process.env.DATABASE_URL!);
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
