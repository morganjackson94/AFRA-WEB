-- AlterTable: add Stripe subscription id to Operator
ALTER TABLE "Operator" ADD COLUMN "stripeSubscriptionId" TEXT;

-- CreateTable: activation event log
CREATE TABLE "Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operatorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "metaForwarded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Event_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Operator_stripeSubscriptionId_key" ON "Operator"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "Event_operatorId_type_key" ON "Event"("operatorId", "type");

-- CreateIndex
CREATE INDEX "Event_operatorId_idx" ON "Event"("operatorId");
