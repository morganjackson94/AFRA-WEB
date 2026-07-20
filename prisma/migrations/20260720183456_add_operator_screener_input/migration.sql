-- AlterTable
ALTER TABLE "Operator" ADD COLUMN     "badHireText" TEXT,
ADD COLUMN     "disqualifiers" TEXT[] DEFAULT ARRAY[]::TEXT[];
