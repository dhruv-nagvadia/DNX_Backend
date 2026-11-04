-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "confirmedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "confirmedAt" TIMESTAMP(3);
