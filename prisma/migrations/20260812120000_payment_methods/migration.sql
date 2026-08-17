-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'PARTIAL';

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('ONLINE', 'CASH', 'PARTIAL');

-- AlterTable
ALTER TABLE "Booking"
  ADD COLUMN "amountPaidMinor" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'ONLINE';

-- AlterTable
ALTER TABLE "Provider" ADD COLUMN "depositPercent" INTEGER NOT NULL DEFAULT 0;
