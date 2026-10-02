-- CreateEnum
CREATE TYPE "PlatformCouponAppliesTo" AS ENUM ('ANY', 'BOOKING', 'ORDER');

-- CreateTable
CREATE TABLE "PlatformCoupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "appliesTo" "PlatformCouponAppliesTo" NOT NULL DEFAULT 'ANY',
    "discountType" "DiscountType" NOT NULL,
    "discountValue" INTEGER NOT NULL,
    "minOrderMinor" INTEGER NOT NULL DEFAULT 0,
    "maxDiscountMinor" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "usageLimit" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformCoupon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformCoupon_code_key" ON "PlatformCoupon"("code");
