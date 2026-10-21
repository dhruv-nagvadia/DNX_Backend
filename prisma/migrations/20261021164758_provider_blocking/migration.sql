-- AlterTable
ALTER TABLE "Provider" ADD COLUMN     "blockedAt" TIMESTAMP(3),
ADD COLUMN     "blockedReason" TEXT,
ADD COLUMN     "codDisabledByAdmin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "codDisabledReason" TEXT,
ADD COLUMN     "isBlocked" BOOLEAN NOT NULL DEFAULT false;
