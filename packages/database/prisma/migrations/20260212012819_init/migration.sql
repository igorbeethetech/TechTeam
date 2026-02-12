-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "MergeStrategy" AS ENUM ('fifo', 'priority');

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "repoUrl" TEXT NOT NULL,
    "repoPath" TEXT NOT NULL,
    "defaultBranch" TEXT NOT NULL DEFAULT 'main',
    "techStack" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'active',
    "maxConcurrentDev" INTEGER NOT NULL DEFAULT 1,
    "mergeStrategy" "MergeStrategy" NOT NULL DEFAULT 'fifo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Project_tenantId_idx" ON "Project"("tenantId");
