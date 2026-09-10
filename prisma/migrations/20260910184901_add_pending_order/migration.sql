-- CreateTable
CREATE TABLE "PendingOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "razorpayOrderId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingOrder_razorpayOrderId_key" ON "PendingOrder"("razorpayOrderId");

-- CreateIndex
CREATE INDEX "PendingOrder_userId_idx" ON "PendingOrder"("userId");
