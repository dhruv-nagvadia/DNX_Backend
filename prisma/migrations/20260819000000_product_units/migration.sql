-- Drop the section grouping; stock is now tracked per-unit and may be fractional.
ALTER TABLE "Product" DROP COLUMN "section";
ALTER TABLE "Product" ALTER COLUMN "stockQty" SET DATA TYPE DOUBLE PRECISION;
