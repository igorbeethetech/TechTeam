"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useWsStatus } from "@/hooks/use-websocket"
import {
  PIPELINE_STAGES,
  STAGE_LABELS,
  type PipelineStage,
  type DemandStage,
  type AgentRun,
} from "@techteam/shared"
import { CheckCircle2, Circle, Loader2, XCircle, Pause } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

// Stages that have agent phases (exclude inbox and done)
const AGENT_PHASES: PipelineStage[] = [
  "discovery",
  "planning",
  "development",
  "testing",
  "review",
]

type PhaseStatus = "completed" | "running" | "failed" | "paused" | "pending"

interface PhaseInfo {
  stage: PipelineStage
  status: PhaseStatus
  durationMs: number
  attempts: number
}

function formatDuration(ms: number): string {
  if (ms <= 0) return ""
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

function derivePhaseInfo(
  currentStage: DemandStage,
  agentStatus: string | null,
  agentRuns: AgentRun[]
): PhaseInfo[] {
  const displayStage = currentStage === "merge" ? "review" : currentStage
  const currentIndex = AGENT_PHASES.indexOf(displayStage as PipelineStage)

  return AGENT_PHASES.map((stage, index) => {
    // Get runs for this phase
    const phaseRuns = agentRuns.filter((r) => r.phase === stage)
    const totalDuration = phaseRuns.reduce((sum, r) => sum + r.durationMs, 0)
    const attempts = phaseRuns.length

    let status: PhaseStatus = "pending"

    if (index < currentIndex) {
      // Past phase - check if it completed or failed
      const hasCompleted = phaseRuns.some((r) => r.status === "completed")
      status = hasCompleted ? "completed" : attempts > 0 ? "completed" : "completed"
    } else if (index === currentIndex) {
      // Current phase
      if (stage === "review") {
        // Review is a human stage, not agent
        status = displayStage === "review" ? "running" : "pending"
      } else if (agentStatus === "running") {
        status = "running"
      } else if (agentStatus === "paused") {
        status = "paused"
      } else if (agentStatus === "failed" || agentStatus === "timeout") {
        status = "failed"
      } else if (agentStatus === "completed") {
        status = "completed"
      } else if (phaseRuns.some((r) => r.status === "completed")) {
        status = "completed"
      } else {
        status = "running"
      }
    }
    // else: pending (future phase)

    // Special case: done stage means all phases completed
    if (displayStage === "done") {
      status = "completed"
    }

    return { stage, status, durationMs: totalDuration, attempts }
  })
}

function PhaseIcon({ status }: { status: PhaseStatus }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="size-5 text-green-500" />
    case "running":
      return <Loader2 className="size-5 animate-spin text-blue-500" />
    case "failed":
      return <XCircle className="size-5 text-red-500" />
    case "paused":
      return <Pause className="size-5 text-yellow-500" />
    default:
      return <Circle className="size-5 text-gray-300" />
  }
}

interface PhaseStepperProps {
  demandId: string
  currentStage: DemandStage
  agentStatus: string | null
  isAgentActive?: boolean
}

export function PhaseStepper({
  demandId,
  currentStage,
  agentStatus,
  isAgentActive,
}: PhaseStepperProps) {
  const wsStatus = useWsStatus()

  const { data } = useQuery({
    queryKey: ["agent-runs", demandId],
    queryFn: () =>
      api.get<{ agentRuns: AgentRun[] }>(
        `/api/agent-runs?demandId=${demandId}`
      ),
    refetchInterval:
      wsStatus === "connected" ? false : isAgentActive ? 5000 : false,
  })

  const agentRuns = data?.agentRuns ?? []
  const phases = derivePhaseInfo(currentStage, agentStatus, agentRuns)

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        {phases.map((phase, index) => (
          <div key={phase.stage} className="flex items-center">
            {/* Connector line (before each step except first) */}
            {index > 0 && (
              <div
                className={cn(
                  "h-px w-6 sm:w-10",
                  phase.status !== "pending" ? "bg-green-400" : "bg-gray-200"
                )}
              />
            )}

            {/* Step */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex flex-col items-center gap-1">
                  <PhaseIcon status={phase.status} />
                  <span
                    className={cn(
                      "text-[10px] sm:text-xs whitespace-nowrap",
                      phase.status === "running"
                        ? "font-semibold text-blue-600"
                        : phase.status === "completed"
                          ? "text-green-700"
                          : phase.status === "failed"
                            ? "text-red-600"
                            : "text-muted-foreground"
                    )}
                  >
                    {STAGE_LABELS[phase.stage]}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-xs">
                  <p className="font-medium">
                    {STAGE_LABELS[phase.stage]} -{" "}
                    {phase.status === "completed"
                      ? "Completed"
                      : phase.status === "running"
                        ? "In Progress"
                        : phase.status === "failed"
                          ? "Failed"
                          : phase.status === "paused"
                            ? "Paused"
                            : "Pending"}
                  </p>
                  {phase.durationMs > 0 && (
                    <p>Duration: {formatDuration(phase.durationMs)}</p>
                  )}
                  {phase.attempts > 0 && (
                    <p>
                      {phase.attempts} run{phase.attempts !== 1 ? "s" : ""}
                    </p>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          </div>
        ))}
      </div>
    </TooltipProvider>
  )
}
