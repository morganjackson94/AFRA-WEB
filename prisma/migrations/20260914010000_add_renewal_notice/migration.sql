-- AlterTable
ALTER TABLE "Operator" ADD COLUMN     "renewalNoticeSentForRenewsAt" TIMESTAMP(3),
ADD COLUMN     "subscriptionRenewsAt" TIMESTAMP(3);
