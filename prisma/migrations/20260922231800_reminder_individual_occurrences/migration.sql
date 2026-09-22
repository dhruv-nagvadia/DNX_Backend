-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'DONE', 'MISSED');

-- AlterTable: add new columns first (nullable / defaulted) so existing rows survive
ALTER TABLE "Reminder" ADD COLUMN     "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "respondedAt" TIMESTAMP(3),
ADD COLUMN     "previousOccurrenceId" TEXT;

-- Backfill: a reminder that was already completed (old one-time-complete model)
-- becomes a DONE occurrence with its original completion timestamp.
UPDATE "Reminder" SET "status" = 'DONE', "respondedAt" = "completedAt" WHERE "completedAt" IS NOT NULL;

-- AlterTable: drop the columns superseded by the new occurrence model
ALTER TABLE "Reminder" DROP COLUMN "completedAt",
DROP COLUMN "previousDueDate";
