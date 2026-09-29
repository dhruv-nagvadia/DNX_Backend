-- AlterTable
ALTER TABLE "User" ADD COLUMN     "resetOtpHash" TEXT,
ADD COLUMN     "resetOtpExpiresAt" TIMESTAMP(3),
ADD COLUMN     "resetOtpAttempts" INTEGER NOT NULL DEFAULT 0;
