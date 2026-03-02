-- AlterTable
ALTER TABLE "AgentRun" ADD COLUMN     "skillsUsed" TEXT[];

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "tags" TEXT[],
    "applicablePhases" TEXT[],
    "category" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Skill_tenantId_idx" ON "Skill"("tenantId");

-- CreateIndex
CREATE INDEX "Skill_tenantId_enabled_idx" ON "Skill"("tenantId", "enabled");
