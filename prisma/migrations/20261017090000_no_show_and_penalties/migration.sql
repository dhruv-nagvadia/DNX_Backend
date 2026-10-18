-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'NO_SHOW';

-- CreateEnum
CREATE TYPE "PenaltyStatus" AS ENUM ('PENDING', 'PAID', 'WAIVED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "isBlocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "blockedReason" TEXT;
ALTER TABLE "User" ADD COLUMN "blockedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "UserPenalty" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "status" "PenaltyStatus" NOT NULL DEFAULT 'PENDING',
    "createdByAdminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPenalty_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserPenalty_userId_idx" ON "UserPenalty"("userId");

-- CreateIndex
CREATE INDEX "UserPenalty_status_idx" ON "UserPenalty"("status");

-- AddForeignKey
ALTER TABLE "UserPenalty" ADD CONSTRAINT "UserPenalty_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
