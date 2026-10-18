-- CreateEnum
CREATE TYPE "PayoutDirection" AS ENUM ('TO_PROVIDER', 'FROM_PROVIDER');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "commissionBps" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "gatewayFeeMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "onlinePaidMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "settledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "commissionBps" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "gatewayFeeMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "onlinePaidMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "settledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PlatformConfig" ADD COLUMN     "commissionBps" INTEGER NOT NULL DEFAULT 1000,
ADD COLUMN     "gatewayFeeAboveMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "gatewayFeeBps" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "gatewayFeeCapMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "gatewayFeeFlatMinor" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Provider" ADD COLUMN     "commissionBps" INTEGER;

-- CreateTable
CREATE TABLE "ProviderPayout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "direction" "PayoutDirection" NOT NULL DEFAULT 'TO_PROVIDER',
    "amountMinor" INTEGER NOT NULL,
    "method" TEXT,
    "reference" TEXT,
    "note" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProviderPayout_userId_idx" ON "ProviderPayout"("userId");

-- CreateIndex
CREATE INDEX "ProviderPayout_paidAt_idx" ON "ProviderPayout"("paidAt");

-- AddForeignKey
ALTER TABLE "ProviderPayout" ADD CONSTRAINT "ProviderPayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill for rows that predate commissions. They keep commissionBps = 0, so
-- no commission is ever charged retroactively; the rest only makes their
-- sales show up correctly in earnings.
--
-- settledAt: the date a finished booking/order is counted on.
UPDATE "Booking" SET "settledAt" = "updatedAt" WHERE "status" IN ('COMPLETED', 'CANCELLED', 'NO_SHOW');
UPDATE "Order"   SET "settledAt" = "updatedAt" WHERE "status" IN ('COMPLETED', 'CANCELLED', 'NO_SHOW');

-- onlinePaidMinor: money that went through the gateway. CASH payments, and
-- anything settled in person (paymentRef 'cash_…'), were never online.
UPDATE "Booking" SET "onlinePaidMinor" = "amountPaidMinor"
  WHERE "paymentMethod" <> 'CASH' AND COALESCE("paymentRef", '') NOT LIKE 'cash\_%';
UPDATE "Order" SET "onlinePaidMinor" = "amountPaidMinor"
  WHERE "paymentMethod" <> 'CASH' AND COALESCE("paymentRef", '') NOT LIKE 'cash\_%';

-- Keep a platform-wide index handy for date-ranged earnings queries.
CREATE INDEX "Booking_settledAt_idx" ON "Booking"("settledAt");
CREATE INDEX "Order_settledAt_idx" ON "Order"("settledAt");
