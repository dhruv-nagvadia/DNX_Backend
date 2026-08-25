-- A review can now be tied to an order (store) instead of a booking (service).
ALTER TABLE "Review" ALTER COLUMN "bookingId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Review" ADD COLUMN "orderId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Review_orderId_key" ON "Review"("orderId");

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
