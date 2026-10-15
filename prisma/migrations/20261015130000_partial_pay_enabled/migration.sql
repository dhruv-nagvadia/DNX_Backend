-- AlterTable
ALTER TABLE "Provider" ADD COLUMN "partialPayEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "partialPayEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN "partialPayEnabled" BOOLEAN NOT NULL DEFAULT true;
