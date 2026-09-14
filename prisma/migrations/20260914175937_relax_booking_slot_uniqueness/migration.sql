-- DropIndex
DROP INDEX "Booking_providerId_startTime_key";

-- CreateIndex
CREATE INDEX "Booking_providerId_startTime_idx" ON "Booking"("providerId", "startTime");

-- A cancelled booking must not permanently occupy its old slot, so the
-- uniqueness constraint only applies to bookings that are still active.
-- Prisma's schema DSL can't express a partial index, so this exists only
-- here — @@index([providerId, startTime]) in schema.prisma is a plain,
-- non-unique index for query planning.
CREATE UNIQUE INDEX "Booking_providerId_startTime_active_key"
  ON "Booking"("providerId", "startTime")
  WHERE "status" != 'CANCELLED';
