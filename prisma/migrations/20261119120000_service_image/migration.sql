-- Optional per-service photo (customer service cards; falls back to the business photo).
ALTER TABLE "Service" ADD COLUMN "imageUrl" TEXT;
