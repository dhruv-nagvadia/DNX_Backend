-- AlterTable
ALTER TABLE "User" ADD COLUMN "codDisabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "readyAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PlatformConfig" (
    "id" SERIAL NOT NULL,
    "orderPickupWindowHours" INTEGER NOT NULL DEFAULT 24,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformConfig_pkey" PRIMARY KEY ("id")
);
