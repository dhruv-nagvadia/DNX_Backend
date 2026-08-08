-- CreateTable
CREATE TABLE "BusinessDateHour" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "openTime" TEXT NOT NULL DEFAULT '09:00',
    "closeTime" TEXT NOT NULL DEFAULT '18:00',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessDateHour_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessDateHour_providerId_idx" ON "BusinessDateHour"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessDateHour_providerId_date_key" ON "BusinessDateHour"("providerId", "date");

-- AddForeignKey
ALTER TABLE "BusinessDateHour" ADD CONSTRAINT "BusinessDateHour_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
