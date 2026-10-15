-- AlterTable
ALTER TABLE "Provider" ADD COLUMN "codEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "codEnabled" BOOLEAN NOT NULL DEFAULT true;
