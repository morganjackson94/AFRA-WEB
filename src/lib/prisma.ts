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

// VERCEL is injected by Vercel's own infra on every deployment (Production,
// Preview, `vercel dev`) — never present for a plain local `npm run dev` or
// a script run on someone's laptop. That's the split this guard relies on:
// on Vercel, each environment already gets its own correctly-scoped
// DATABASE_URL from Vercel's env store. Off Vercel, DEV_DATABASE_URL is
// required with no fallback to DATABASE_URL (which .env sets to
// production) — see docs/DATABASE.md for the incident this closes.
function resolveDatabaseUrl(): string {
  if (process.env.VERCEL) return process.env.DATABASE_URL!;

  const devUrl = process.env.DEV_DATABASE_URL;
  if (!devUrl) {
    throw new Error(
      "DEV_DATABASE_URL is not set. Local dev must not silently fall back to " +
        "DATABASE_URL (production) — see docs/DATABASE.md.",
    );
  }
  return devUrl;
}

function createClient() {
  const url = resolveDatabaseUrl();
  const adapter = new PrismaPg(url);
  const client = new PrismaClient({ adapter });

  // Second layer, local-only: refuse even a correctly-set DEV_DATABASE_URL
  // if it happens to carry the ProductionMarker row (schema.prisma) — a
  // host-string check alone can't tell production's Prisma Postgres
  // resource apart from the separate dev one, since both live on
  // db.prisma.io. Fire-and-forget: Prisma clients are constructed
  // synchronously, so this can't block createClient() itself, but it still
  // brings the dev server down loudly within a query cycle if it fires.
  if (!process.env.VERCEL) {
    client.productionMarker.findFirst().then((marker) => {
      if (marker) {
        console.error(
          "\nREFUSING TO CONTINUE: DEV_DATABASE_URL points at a database " +
            "carrying the production marker row. See docs/DATABASE.md.\n",
        );
        process.exit(1);
      }
    });
  }

  return client;
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
