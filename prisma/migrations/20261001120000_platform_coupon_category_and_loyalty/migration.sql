-- AlterTable
ALTER TABLE "PlatformCoupon" ADD COLUMN "categoryId" TEXT;
ALTER TABLE "PlatformCoupon" ADD COLUMN "minCustomerOrders" INTEGER;

-- CreateIndex
CREATE INDEX "PlatformCoupon_categoryId_idx" ON "PlatformCoupon"("categoryId");

-- AddForeignKey
ALTER TABLE "PlatformCoupon" ADD CONSTRAINT "PlatformCoupon_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
