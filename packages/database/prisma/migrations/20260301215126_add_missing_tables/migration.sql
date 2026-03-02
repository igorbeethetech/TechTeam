-- CreateEnum
CREATE TYPE "AgentExecutionMode" AS ENUM ('sdk', 'cli');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('queued', 'running', 'completed', 'failed', 'timeout', 'paused');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('agent_failed', 'merge_needs_human', 'demand_done');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('active', 'inactive', 'archived');

-- CreateEnum
CREATE TYPE "ClientSector" AS ENUM ('education', 'healthcare', 'legal', 'insurance', 'finance', 'retail', 'technology', 'other');

-- CreateEnum
CREATE TYPE "ReqsProjectStatus" AS ENUM ('discovery', 'requirements', 'proposal', 'approved', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "ReqsProjectType" AS ENUM ('automation', 'chatbot', 'integration', 'platform', 'rpa', 'consulting', 'other');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('scheduled', 'recording', 'processing', 'completed');

-- CreateEnum
CREATE TYPE "StickyCategory" AS ENUM ('problem', 'process', 'requirement', 'integration', 'risk', 'decision', 'question', 'scope', 'persona', 'constraint', 'assumption');

-- CreateEnum
CREATE TYPE "StickyPriority" AS ENUM ('critical', 'high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "StickyStatus" AS ENUM ('open', 'confirmed', 'rejected', 'deferred');

-- CreateEnum
CREATE TYPE "StickySource" AS ENUM ('ai', 'manual');

-- CreateEnum
CREATE TYPE "SuggestionType" AS ENUM ('question', 'alert', 'insight', 'risk_warning');

-- CreateEnum
CREATE TYPE "SuggestionUrgency" AS ENUM ('critical', 'high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "SuggestionDimension" AS ENUM ('scope', 'exceptions', 'data', 'permissions', 'volume', 'integrations', 'business_rules', 'sla', 'migration', 'compliance', 'dependencies', 'acceptance_criteria');

-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('pending', 'asked', 'deferred', 'dismissed');

-- AlterTable
ALTER TABLE "Demand" ADD COLUMN     "agentStatus" TEXT,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "rejectionCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "testingFeedback" JSONB;

-- CreateTable
CREATE TABLE "TenantSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "githubToken" TEXT,
    "anthropicApiKey" TEXT,
    "agentExecutionMode" "AgentExecutionMode" NOT NULL DEFAULT 'sdk',
    "beeLanguage" TEXT NOT NULL DEFAULT 'pt-BR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "demandId" TEXT NOT NULL,
    "phase" "DemandStage" NOT NULL,
    "status" "AgentStatus" NOT NULL,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "output" JSONB,
    "error" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "demandId" TEXT,
    "projectId" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sector" "ClientSector" NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#6c5ce7',
    "logoUrl" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "status" "ClientStatus" NOT NULL DEFAULT 'active',
    "metadata" JSONB,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReqsProject" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" "ReqsProjectStatus" NOT NULL DEFAULT 'discovery',
    "projectType" "ReqsProjectType",
    "estimatedHours" INTEGER,
    "estimatedValue" DOUBLE PRECISION,
    "startDate" TIMESTAMP(3),
    "deadline" TIMESTAMP(3),
    "metadata" JSONB,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReqsProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reqsProjectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "meetingNumber" INTEGER NOT NULL,
    "status" "MeetingStatus" NOT NULL DEFAULT 'scheduled',
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "audioUrl" TEXT,
    "participants" TEXT[],
    "summary" TEXT,
    "notes" TEXT,
    "aiAnalysis" JSONB,
    "metadata" JSONB,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranscriptChunk" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "speaker" TEXT,
    "timestampStart" DOUBLE PRECISION,
    "timestampEnd" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION,
    "isProcessed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranscriptChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sticky" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "reqsProjectId" TEXT NOT NULL,
    "category" "StickyCategory" NOT NULL,
    "text" TEXT NOT NULL,
    "details" TEXT,
    "priority" "StickyPriority" NOT NULL DEFAULT 'medium',
    "status" "StickyStatus" NOT NULL DEFAULT 'open',
    "source" "StickySource" NOT NULL DEFAULT 'ai',
    "positionX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "positionY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "boardColumn" TEXT,
    "transcriptChunkId" TEXT,
    "timestampRef" TEXT,
    "tags" TEXT[],
    "relatedStickyIds" TEXT[],
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sticky_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AISuggestion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "suggestionType" "SuggestionType" NOT NULL,
    "text" TEXT NOT NULL,
    "reason" TEXT,
    "urgency" "SuggestionUrgency" NOT NULL DEFAULT 'medium',
    "dimension" "SuggestionDimension",
    "status" "SuggestionStatus" NOT NULL DEFAULT 'pending',
    "triggerChunkId" TEXT,
    "triggerStickyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "AISuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantSettings_tenantId_key" ON "TenantSettings"("tenantId");

-- CreateIndex
CREATE INDEX "TenantSettings_tenantId_idx" ON "TenantSettings"("tenantId");

-- CreateIndex
CREATE INDEX "AgentRun_tenantId_idx" ON "AgentRun"("tenantId");

-- CreateIndex
CREATE INDEX "AgentRun_demandId_idx" ON "AgentRun"("demandId");

-- CreateIndex
CREATE INDEX "AgentRun_demandId_phase_idx" ON "AgentRun"("demandId", "phase");

-- CreateIndex
CREATE INDEX "Notification_tenantId_read_createdAt_idx" ON "Notification"("tenantId", "read", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_tenantId_createdAt_idx" ON "Notification"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Client_tenantId_idx" ON "Client"("tenantId");

-- CreateIndex
CREATE INDEX "Client_tenantId_status_idx" ON "Client"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Client_tenantId_slug_key" ON "Client"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "ReqsProject_tenantId_idx" ON "ReqsProject"("tenantId");

-- CreateIndex
CREATE INDEX "ReqsProject_clientId_idx" ON "ReqsProject"("clientId");

-- CreateIndex
CREATE INDEX "ReqsProject_tenantId_status_idx" ON "ReqsProject"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ReqsProject_clientId_slug_key" ON "ReqsProject"("clientId", "slug");

-- CreateIndex
CREATE INDEX "Meeting_tenantId_idx" ON "Meeting"("tenantId");

-- CreateIndex
CREATE INDEX "Meeting_reqsProjectId_idx" ON "Meeting"("reqsProjectId");

-- CreateIndex
CREATE INDEX "Meeting_reqsProjectId_meetingNumber_idx" ON "Meeting"("reqsProjectId", "meetingNumber");

-- CreateIndex
CREATE INDEX "TranscriptChunk_tenantId_idx" ON "TranscriptChunk"("tenantId");

-- CreateIndex
CREATE INDEX "TranscriptChunk_meetingId_idx" ON "TranscriptChunk"("meetingId");

-- CreateIndex
CREATE INDEX "TranscriptChunk_meetingId_chunkIndex_idx" ON "TranscriptChunk"("meetingId", "chunkIndex");

-- CreateIndex
CREATE INDEX "Sticky_tenantId_idx" ON "Sticky"("tenantId");

-- CreateIndex
CREATE INDEX "Sticky_meetingId_idx" ON "Sticky"("meetingId");

-- CreateIndex
CREATE INDEX "Sticky_reqsProjectId_idx" ON "Sticky"("reqsProjectId");

-- CreateIndex
CREATE INDEX "Sticky_reqsProjectId_category_idx" ON "Sticky"("reqsProjectId", "category");

-- CreateIndex
CREATE INDEX "AISuggestion_tenantId_idx" ON "AISuggestion"("tenantId");

-- CreateIndex
CREATE INDEX "AISuggestion_meetingId_idx" ON "AISuggestion"("meetingId");

-- CreateIndex
CREATE INDEX "AISuggestion_meetingId_status_idx" ON "AISuggestion"("meetingId", "status");

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_demandId_fkey" FOREIGN KEY ("demandId") REFERENCES "Demand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_demandId_fkey" FOREIGN KEY ("demandId") REFERENCES "Demand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReqsProject" ADD CONSTRAINT "ReqsProject_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_reqsProjectId_fkey" FOREIGN KEY ("reqsProjectId") REFERENCES "ReqsProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptChunk" ADD CONSTRAINT "TranscriptChunk_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sticky" ADD CONSTRAINT "Sticky_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sticky" ADD CONSTRAINT "Sticky_reqsProjectId_fkey" FOREIGN KEY ("reqsProjectId") REFERENCES "ReqsProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AISuggestion" ADD CONSTRAINT "AISuggestion_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
