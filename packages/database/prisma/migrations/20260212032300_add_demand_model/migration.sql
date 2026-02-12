-- CreateEnum
CREATE TYPE "DemandStage" AS ENUM ('inbox', 'discovery', 'planning', 'development', 'testing', 'merge', 'done');

-- CreateEnum
CREATE TYPE "DemandPriority" AS ENUM ('low', 'medium', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "Complexity" AS ENUM ('S', 'M', 'L', 'XL');

-- CreateEnum
CREATE TYPE "MergeStatus" AS ENUM ('pending', 'auto_merged', 'conflict_resolving', 'needs_human', 'merged');

-- CreateTable
CREATE TABLE "Demand" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "stage" "DemandStage" NOT NULL DEFAULT 'inbox',
    "priority" "DemandPriority" NOT NULL DEFAULT 'medium',
    "complexity" "Complexity",
    "requirements" JSONB,
    "plan" JSONB,
    "branchName" TEXT,
    "prUrl" TEXT,
    "mergeStatus" "MergeStatus",
    "mergeConflicts" JSONB,
    "mergeAttempts" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "totalCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Demand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Demand_tenantId_idx" ON "Demand"("tenantId");

-- CreateIndex
CREATE INDEX "Demand_projectId_idx" ON "Demand"("projectId");

-- CreateIndex
CREATE INDEX "Demand_stage_idx" ON "Demand"("stage");

-- CreateIndex
CREATE INDEX "Demand_projectId_stage_idx" ON "Demand"("projectId", "stage");

-- AddForeignKey
ALTER TABLE "Demand" ADD CONSTRAINT "Demand_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
