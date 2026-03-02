"use client"

import { useState } from "react"
import Link from "next/link"
import { useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Calendar, Play, User, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PipelineProgress } from "./pipeline-progress"
import { PhaseStepper } from "./phase-stepper"
import { QuickInfoBar } from "./quick-info-bar"
import { RequirementsView } from "./requirements-view"
import { PlanView } from "./plan-view"
import { DevelopmentView } from "./development-view"
import { TestingReportView } from "./testing-report-view"
import { MergeStatusView } from "./merge-status-view"
import { ReviewSection } from "./review-section"
import { AgentRunList } from "./agent-run-list"
import { ActivityTimeline } from "./activity-timeline"
import {
  STAGE_LABELS,
  type Demand,
  type DemandPriority,
  type DemandStage,
  type PipelineStage,
  type DiscoveryOutput,
  type PlanningOutput,
  type TestingOutput,
} from "@techteam/shared"

const PRIORITY_COLORS: Record<DemandPriority, string> = {
  low: "bg-slate-100 text-slate-700 hover:bg-slate-100",
  medium: "bg-blue-100 text-blue-700 hover:bg-blue-100",
  high: "bg-orange-100 text-orange-700 hover:bg-orange-100",
  urgent: "bg-red-100 text-red-700 hover:bg-red-100",
}

const STAGE_BADGE_COLORS: Record<string, string> = {
  inbox: "bg-gray-100 text-gray-700 hover:bg-gray-100",
  discovery: "bg-violet-100 text-violet-700 hover:bg-violet-100",
  planning: "bg-indigo-100 text-indigo-700 hover:bg-indigo-100",
  development: "bg-cyan-100 text-cyan-700 hover:bg-cyan-100",
  testing: "bg-teal-100 text-teal-700 hover:bg-teal-100",
  review: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  done: "bg-green-100 text-green-700 hover:bg-green-100",
  merge: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
}

const AGENT_STATUS_STYLES: Record<string, string> = {
  running: "bg-blue-100 text-blue-700 hover:bg-blue-100 animate-pulse",
  queued: "bg-gray-100 text-gray-700 hover:bg-gray-100",
  paused: "bg-yellow-100 text-yellow-700 hover:bg-yellow-100",
  failed: "bg-red-100 text-red-700 hover:bg-red-100",
  completed: "bg-green-100 text-green-700 hover:bg-green-100",
  timeout: "bg-orange-100 text-orange-700 hover:bg-orange-100",
}

const AGENT_STATUS_LABELS: Record<string, string> = {
  running: "Agent Running",
  queued: "Agent Queued",
  paused: "Paused - needs input",
  failed: "Agent Failed",
  completed: "Agent Completed",
  timeout: "Agent Timed Out",
}

interface DemandWithProject extends Demand {
  project?: {
    id: string
    name: string
    repoUrl: string
    defaultBranch: string
    testInstructions: string | null
    previewUrlTemplate: string | null
  }
}

interface DemandDetailProps {
  demand: DemandWithProject
  isAgentActive?: boolean
}

function getDisplayStage(stage: DemandStage): string {
  if (stage === "merge") return STAGE_LABELS["review"] ?? stage
  return STAGE_LABELS[stage as PipelineStage] ?? stage
}

function getDefaultTab(demand: DemandWithProject): string {
  if (demand.stage === "review") return "review"
  if (demand.testingFeedback != null) return "tests"
  if (demand.branchName || demand.prUrl) return "development"
  if (demand.plan != null) return "plan"
  if (demand.requirements != null) return "requirements"
  return "overview"
}

export function DemandDetail({ demand, isAgentActive }: DemandDetailProps) {
  const queryClient = useQueryClient()
  const [isStarting, setIsStarting] = useState(false)

  async function handleStart() {
    setIsStarting(true)
    try {
      await api.post(`/api/demands/${demand.id}/start`)
      toast.success("Pipeline iniciado")
      await queryClient.invalidateQueries({ queryKey: ["demand", demand.id] })
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Erro ao iniciar pipeline"
      toast.error(message)
    } finally {
      setIsStarting(false)
    }
  }

  const previewUrl =
    demand.project?.previewUrlTemplate && demand.branchName
      ? demand.project.previewUrlTemplate.replace(
          "{branch}",
          encodeURIComponent(demand.branchName)
        )
      : null

  const hasRequirements = demand.requirements != null
  const hasPlan = demand.plan != null
  const hasDevelopment = !!(demand.branchName || demand.prUrl)
  const hasTesting = demand.testingFeedback != null
  const hasReview = demand.stage === "review"
  const hasLegacyMerge = !!(demand.mergeStatus || demand.stage === "merge")

  return (
    <div className="space-y-6">
      {/* Back navigation */}
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/projects/${demand.projectId}/board`}>
          <ArrowLeft className="size-4" />
          Back to Board
        </Link>
      </Button>

      {/* Header: Title + Badges */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-start gap-3">
          <h1 className="text-2xl font-bold flex-1 min-w-0">{demand.title}</h1>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Badge
              className={
                PRIORITY_COLORS[demand.priority] ?? PRIORITY_COLORS.medium
              }
            >
              {demand.priority.charAt(0).toUpperCase() +
                demand.priority.slice(1)}
            </Badge>
            <Badge
              className={
                STAGE_BADGE_COLORS[demand.stage] ??
                "bg-gray-100 text-gray-700"
              }
            >
              {getDisplayStage(demand.stage)}
            </Badge>
            {demand.agentStatus && (
              <Badge
                className={
                  AGENT_STATUS_STYLES[demand.agentStatus] ??
                  "bg-gray-100 text-gray-700"
                }
              >
                {demand.agentStatus === "running" && (
                  <Loader2 className="mr-1 size-3 animate-spin" />
                )}
                {AGENT_STATUS_LABELS[demand.agentStatus] ??
                  demand.agentStatus}
              </Badge>
            )}
            {demand.stage === "inbox" && (
              <Button
                size="sm"
                onClick={handleStart}
                disabled={isStarting}
              >
                {isStarting ? (
                  <Loader2 className="mr-1 size-4 animate-spin" />
                ) : (
                  <Play className="mr-1 size-4" />
                )}
                Iniciar
              </Button>
            )}
          </div>
        </div>

        {/* Metadata line */}
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Calendar className="size-3.5" />
            {new Date(demand.createdAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </span>
          {demand.createdBy && (
            <span className="flex items-center gap-1.5">
              <User className="size-3.5" />
              {demand.createdBy}
            </span>
          )}
          {demand.complexity && (
            <Badge variant="outline" className="text-xs">
              {demand.complexity}
            </Badge>
          )}
        </div>
      </div>

      {/* Phase Stepper */}
      <PhaseStepper
        demandId={demand.id}
        currentStage={demand.stage}
        agentStatus={demand.agentStatus}
        isAgentActive={isAgentActive}
      />

      {/* Quick Info Bar */}
      <QuickInfoBar
        branchName={demand.branchName}
        prUrl={demand.prUrl}
        previewUrl={previewUrl}
        totalCostUsd={demand.totalCostUsd}
        totalTokens={demand.totalTokens}
      />

      {/* Review Section (prominent, outside tabs when active) */}
      {hasReview && (
        <ReviewSection
          demandId={demand.id}
          projectId={demand.projectId}
          branchName={demand.branchName}
          prUrl={demand.prUrl}
          repoUrl={demand.project?.repoUrl}
          testInstructions={demand.project?.testInstructions}
          previewUrlTemplate={demand.project?.previewUrlTemplate}
        />
      )}

      {/* Tabbed Content */}
      <Tabs defaultValue={getDefaultTab(demand)}>
        <TabsList className="w-full flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {hasRequirements && (
            <TabsTrigger value="requirements">Requirements</TabsTrigger>
          )}
          {hasPlan && <TabsTrigger value="plan">Plan</TabsTrigger>}
          {hasDevelopment && (
            <TabsTrigger value="development">Development</TabsTrigger>
          )}
          {hasTesting && <TabsTrigger value="tests">Tests</TabsTrigger>}
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="logs">Agent Logs</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6 pt-4">
          {demand.description && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                Description
              </h3>
              <div className="prose prose-sm max-w-none rounded-lg border p-4">
                <p className="whitespace-pre-wrap">{demand.description}</p>
              </div>
            </div>
          )}

          {!demand.description && (
            <p className="py-4 text-sm text-muted-foreground">
              No description provided.
            </p>
          )}

          {hasLegacyMerge && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                Merge (Legacy)
              </h3>
              <MergeStatusView
                demandId={demand.id}
                mergeStatus={demand.mergeStatus}
                mergeConflicts={demand.mergeConflicts}
                mergeAttempts={demand.mergeAttempts}
                prUrl={demand.prUrl}
                branchName={demand.branchName}
              />
            </div>
          )}
        </TabsContent>

        {/* Requirements Tab */}
        {hasRequirements && (
          <TabsContent value="requirements" className="pt-4">
            <RequirementsView
              requirements={demand.requirements as DiscoveryOutput}
              demandId={demand.id}
              isPaused={demand.agentStatus === "paused"}
            />
          </TabsContent>
        )}

        {/* Plan Tab */}
        {hasPlan && (
          <TabsContent value="plan" className="pt-4">
            <PlanView plan={demand.plan as PlanningOutput} />
          </TabsContent>
        )}

        {/* Development Tab */}
        {hasDevelopment && (
          <TabsContent value="development" className="pt-4">
            <DevelopmentView
              branchName={demand.branchName}
              prUrl={demand.prUrl}
              developmentOutput={null}
              rejectionCount={demand.rejectionCount ?? 0}
            />
          </TabsContent>
        )}

        {/* Tests Tab */}
        {hasTesting && (
          <TabsContent value="tests" className="pt-4">
            <TestingReportView
              testingOutput={demand.testingFeedback as TestingOutput}
              isLatestReport={true}
            />
          </TabsContent>
        )}

        {/* Activity Timeline Tab */}
        <TabsContent value="activity" className="pt-4">
          <ActivityTimeline
            demandId={demand.id}
            createdAt={demand.createdAt}
            currentStage={demand.stage}
            isAgentActive={isAgentActive}
          />
        </TabsContent>

        {/* Agent Logs Tab */}
        <TabsContent value="logs" className="pt-4">
          <AgentRunList demandId={demand.id} isAgentActive={isAgentActive} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
