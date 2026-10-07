-- AlterTable
ALTER TABLE "Operator" ADD COLUMN     "trialCapReachedAt" TIMESTAMP(3),
ADD COLUMN     "trialCapWarningEmailSentAt" TIMESTAMP(3),
ADD COLUMN     "trialEndNoticeEmailSentAt" TIMESTAMP(3),
ADD COLUMN     "trialEndsAt" TIMESTAMP(3);
