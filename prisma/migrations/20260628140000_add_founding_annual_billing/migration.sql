-- AlterTable: founding-annual billing fields on Operator
ALTER TABLE "Operator" ADD COLUMN "plan" TEXT NOT NULL DEFAULT 'monthly';
ALTER TABLE "Operator" ADD COLUMN "stripeCheckoutSessionId" TEXT;
ALTER TABLE "Operator" ADD COLUMN "stripePaymentIntentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Operator_stripeCheckoutSessionId_key" ON "Operator"("stripeCheckoutSessionId");
