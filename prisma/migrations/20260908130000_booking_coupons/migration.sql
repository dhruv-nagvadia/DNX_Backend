-- AlterTable: booking-level discount snapshot
ALTER TABLE "Booking" ADD COLUMN "discountMinor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Booking" ADD COLUMN "couponCode" TEXT;
