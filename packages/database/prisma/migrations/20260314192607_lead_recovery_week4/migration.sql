/*
  Warnings:

  - You are about to drop the column `status` on the `leads` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "leads_gymId_status_idx";

-- AlterTable
ALTER TABLE "leads" DROP COLUMN "status",
ADD COLUMN     "contactAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "currentStage" TEXT NOT NULL DEFAULT 'new',
ADD COLUMN     "lastContactAt" TIMESTAMP(3),
ADD COLUMN     "lastContactChannel" TEXT,
ADD COLUMN     "preferredChannel" TEXT;

-- CreateTable
CREATE TABLE "lead_journey" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "fromStage" TEXT,
    "channel" TEXT,
    "action" TEXT NOT NULL,
    "message" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_journey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "timeSlot" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'tour',
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "confirmedAt" TIMESTAMP(3),
    "remindedAt" TIMESTAMP(3),
    "attendedAt" TIMESTAMP(3),
    "notes" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_journey_leadId_createdAt_idx" ON "lead_journey"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "bookings_gymId_date_idx" ON "bookings"("gymId", "date");

-- CreateIndex
CREATE INDEX "bookings_gymId_leadId_idx" ON "bookings"("gymId", "leadId");

-- CreateIndex
CREATE INDEX "bookings_gymId_status_idx" ON "bookings"("gymId", "status");

-- CreateIndex
CREATE INDEX "leads_gymId_currentStage_idx" ON "leads"("gymId", "currentStage");

-- AddForeignKey
ALTER TABLE "lead_journey" ADD CONSTRAINT "lead_journey_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
