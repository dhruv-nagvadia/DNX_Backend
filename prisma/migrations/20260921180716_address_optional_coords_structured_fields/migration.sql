-- AlterTable
ALTER TABLE "Address" ADD COLUMN     "areaStreet" TEXT,
ADD COLUMN     "houseFlat" TEXT,
ALTER COLUMN "latitude" DROP NOT NULL,
ALTER COLUMN "longitude" DROP NOT NULL;

-- Backfill existing rows: no separate house/flat vs area/street was captured
-- before this migration, so fall back to the existing combined `line` text.
UPDATE "Address" SET "areaStreet" = "line" WHERE "areaStreet" IS NULL;

-- AlterTable
ALTER TABLE "Address" ALTER COLUMN "areaStreet" SET NOT NULL;
