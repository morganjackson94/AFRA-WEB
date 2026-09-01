-- Database guard rail — not application data. See docs/DATABASE.md and
-- scripts/lib/guardDatabase.ts. This table is created in every database
-- (production and dev alike, since it's part of the shared schema), but a
-- row is inserted manually into production only.
-- CreateTable
CREATE TABLE "ProductionMarker" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "environment" TEXT NOT NULL DEFAULT 'production',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionMarker_pkey" PRIMARY KEY ("id")
);
