-- CreateTable
CREATE TABLE "cancel_save_attempts" (
    "id" TEXT NOT NULL,
    "gymId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "reason" TEXT,
    "reasonCategory" TEXT,
    "offerMade" TEXT,
    "offerType" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'in_progress',
    "savedAt" TIMESTAMP(3),
    "lostAt" TIMESTAMP(3),
    "conversationLog" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cancel_save_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_templates" (
    "id" TEXT NOT NULL,
    "gymId" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "variants" JSONB NOT NULL,
    "totalSent" INTEGER NOT NULL DEFAULT 0,
    "totalOpened" INTEGER NOT NULL DEFAULT 0,
    "totalReplied" INTEGER NOT NULL DEFAULT 0,
    "totalConverted" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cancel_save_attempts_gymId_outcome_idx" ON "cancel_save_attempts"("gymId", "outcome");

-- CreateIndex
CREATE INDEX "cancel_save_attempts_memberId_idx" ON "cancel_save_attempts"("memberId");

-- CreateIndex
CREATE INDEX "message_templates_gymId_category_idx" ON "message_templates"("gymId", "category");

-- CreateIndex
CREATE INDEX "message_templates_category_isActive_idx" ON "message_templates"("category", "isActive");

-- AddForeignKey
ALTER TABLE "cancel_save_attempts" ADD CONSTRAINT "cancel_save_attempts_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cancel_save_attempts" ADD CONSTRAINT "cancel_save_attempts_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
