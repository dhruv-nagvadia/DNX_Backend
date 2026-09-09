-- AlterTable
ALTER TABLE "Review" ADD COLUMN "providerReply" TEXT;
ALTER TABLE "Review" ADD COLUMN "repliedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ProductReview" ADD COLUMN "providerReply" TEXT;
ALTER TABLE "ProductReview" ADD COLUMN "repliedAt" TIMESTAMP(3);
