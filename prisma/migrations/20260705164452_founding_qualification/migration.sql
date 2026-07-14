-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Operator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "billingStatus" TEXT NOT NULL DEFAULT 'none',
    "plan" TEXT NOT NULL DEFAULT 'monthly',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripeCheckoutSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "locationsBucket" TEXT,
    "followerBand" TEXT,
    "hiringFrequency" TEXT,
    "reachFlag" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_Operator" ("billingStatus", "createdAt", "email", "id", "name", "plan", "stripeCheckoutSessionId", "stripeCustomerId", "stripePaymentIntentId", "stripeSubscriptionId", "updatedAt") SELECT "billingStatus", "createdAt", "email", "id", "name", "plan", "stripeCheckoutSessionId", "stripeCustomerId", "stripePaymentIntentId", "stripeSubscriptionId", "updatedAt" FROM "Operator";
DROP TABLE "Operator";
ALTER TABLE "new_Operator" RENAME TO "Operator";
CREATE UNIQUE INDEX "Operator_email_key" ON "Operator"("email");
CREATE UNIQUE INDEX "Operator_stripeCustomerId_key" ON "Operator"("stripeCustomerId");
CREATE UNIQUE INDEX "Operator_stripeSubscriptionId_key" ON "Operator"("stripeSubscriptionId");
CREATE UNIQUE INDEX "Operator_stripeCheckoutSessionId_key" ON "Operator"("stripeCheckoutSessionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
