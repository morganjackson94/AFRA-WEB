-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN     "countedTowardTrial" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Operator" ADD COLUMN     "screenedCandidateCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "trialEndedAt" TIMESTAMP(3),
ADD COLUMN     "trialEndedEmailSentAt" TIMESTAMP(3);
