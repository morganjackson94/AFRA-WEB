-- AlterTable
ALTER TABLE "Operator" ADD COLUMN     "hasNycLocation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "locationStates" TEXT[] DEFAULT ARRAY[]::TEXT[];
