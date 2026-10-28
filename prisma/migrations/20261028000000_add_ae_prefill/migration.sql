-- AlterTable
ALTER TABLE "Operator" ADD COLUMN     "sourceAe" TEXT;

-- AlterTable
ALTER TABLE "OnboardingDraft" ADD COLUMN     "aeRef" TEXT,
ADD COLUMN     "prefillCodeHash" TEXT,
ADD COLUMN     "prefillExpiresAt" TIMESTAMP(3),
ADD COLUMN     "prefillOpenedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PrefillAttempt" (
    "id" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrefillAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrefillAttempt_ipHash_createdAt_idx" ON "PrefillAttempt"("ipHash", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingDraft_prefillCodeHash_key" ON "OnboardingDraft"("prefillCodeHash");
