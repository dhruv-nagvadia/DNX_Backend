-- AlterTable
ALTER TABLE "Provider" ADD COLUMN     "images" TEXT[] DEFAULT ARRAY[]::TEXT[];
