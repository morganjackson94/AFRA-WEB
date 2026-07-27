-- CreateTable
CREATE TABLE "WizardFunnelEvent" (
    "id" TEXT NOT NULL,
    "wizardSessionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WizardFunnelEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WizardFunnelEvent_eventType_step_idx" ON "WizardFunnelEvent"("eventType", "step");

-- CreateIndex
CREATE INDEX "WizardFunnelEvent_wizardSessionId_idx" ON "WizardFunnelEvent"("wizardSessionId");
