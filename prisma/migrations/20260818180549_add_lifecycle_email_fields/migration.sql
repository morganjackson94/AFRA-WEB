-- AlterTable
ALTER TABLE "Operator" ADD COLUMN     "checkinEmailDueAt" TIMESTAMP(3),
ADD COLUMN     "checkinEmailSentAt" TIMESTAMP(3),
ADD COLUMN     "liveEmailSentAt" TIMESTAMP(3),
ADD COLUMN     "welcomeEmailSentAt" TIMESTAMP(3);
