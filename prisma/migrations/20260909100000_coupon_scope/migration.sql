-- CreateEnum
CREATE TYPE "CouponScope" AS ENUM ('ORDER', 'SERVICE', 'PRODUCT');

-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN "scope" "CouponScope" NOT NULL DEFAULT 'ORDER';
ALTER TABLE "Coupon" ADD COLUMN "serviceId" TEXT;
ALTER TABLE "Coupon" ADD COLUMN "productId" TEXT;

-- CreateIndex
CREATE INDEX "Coupon_serviceId_idx" ON "Coupon"("serviceId");

-- CreateIndex
CREATE INDEX "Coupon_productId_idx" ON "Coupon"("productId");

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
