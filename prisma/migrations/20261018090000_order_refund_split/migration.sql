-- AlterTable
ALTER TABLE "Order" ADD COLUMN "refundedMinor" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN "unlimitedStock" BOOLEAN NOT NULL DEFAULT false;
