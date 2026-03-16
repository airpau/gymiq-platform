-- AlterTable
ALTER TABLE "gyms" ADD COLUMN     "connectorConfig" JSONB,
ADD COLUMN     "connectorType" TEXT,
ADD COLUMN     "lastSyncAt" TIMESTAMP(3),
ADD COLUMN     "lastSyncStatus" TEXT,
ADD COLUMN     "syncSchedule" TEXT;

-- CreateTable
CREATE TABLE "sync_logs" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "connectorType" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "membersCreated" INTEGER NOT NULL DEFAULT 0,
    "membersUpdated" INTEGER NOT NULL DEFAULT 0,
    "membersSkipped" INTEGER NOT NULL DEFAULT 0,
    "membersErrors" INTEGER NOT NULL DEFAULT 0,
    "leadsCreated" INTEGER NOT NULL DEFAULT 0,
    "leadsUpdated" INTEGER NOT NULL DEFAULT 0,
    "leadsSkipped" INTEGER NOT NULL DEFAULT 0,
    "leadsErrors" INTEGER NOT NULL DEFAULT 0,
    "followupQueued" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sync_logs_gymId_createdAt_idx" ON "sync_logs"("gymId", "createdAt");

-- AddForeignKey
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
