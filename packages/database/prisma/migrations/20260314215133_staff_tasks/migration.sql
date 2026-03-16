-- CreateTable
CREATE TABLE "staff_tasks" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "memberId" TEXT,
    "leadId" TEXT,
    "cancelSaveId" TEXT,
    "assignedTo" TEXT,
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "resolution" TEXT,
    "resolutionNotes" TEXT,
    "dueDate" TIMESTAMP(3),
    "reminderAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_tasks_gymId_status_priority_idx" ON "staff_tasks"("gymId", "status", "priority");

-- CreateIndex
CREATE INDEX "staff_tasks_gymId_category_idx" ON "staff_tasks"("gymId", "category");

-- CreateIndex
CREATE INDEX "staff_tasks_memberId_idx" ON "staff_tasks"("memberId");

-- CreateIndex
CREATE INDEX "staff_tasks_leadId_idx" ON "staff_tasks"("leadId");

-- CreateIndex
CREATE INDEX "staff_tasks_dueDate_idx" ON "staff_tasks"("dueDate");

-- AddForeignKey
ALTER TABLE "staff_tasks" ADD CONSTRAINT "staff_tasks_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_tasks" ADD CONSTRAINT "staff_tasks_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_tasks" ADD CONSTRAINT "staff_tasks_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
