-- Products: measured pricing (price for a base quantity) + minimum/step, all in base units.
ALTER TABLE "Product" ADD COLUMN "measure" TEXT NOT NULL DEFAULT 'count';
ALTER TABLE "Product" ADD COLUMN "priceQty" DOUBLE PRECISION NOT NULL DEFAULT 1;
ALTER TABLE "Product" ADD COLUMN "stepQty" DOUBLE PRECISION NOT NULL DEFAULT 1;

-- Order lines: quantity is now a base-unit amount; snapshot the pricing basis.
ALTER TABLE "OrderItem" ALTER COLUMN "quantity" SET DATA TYPE DOUBLE PRECISION;
ALTER TABLE "OrderItem" ADD COLUMN "measure" TEXT NOT NULL DEFAULT 'count';
ALTER TABLE "OrderItem" ADD COLUMN "priceQty" DOUBLE PRECISION NOT NULL DEFAULT 1;
