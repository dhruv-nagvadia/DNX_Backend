-- AlterEnum
ALTER TYPE "BookingStatus" ADD VALUE 'IN_PROGRESS';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "startedAt" TIMESTAMP(3);
