"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useWsStatus } from "@/hooks/use-websocket"
import {
  type AgentRun,
  type DemandStage,
} from "@techteam/shared"
import {
  CheckCircle2,
  Circle,
  XCircle,
  Loader2,
  Clock,
  Inbox,
  AlertTriangle,
  Pause,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { useTranslation } from "@/i18n/language-context"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface TimelineEvent {
  id: string
  timestamp: Date
  type: "created" | "agent_start" | "agent_end" | "stage_change"
  phase?: string
  status?: string
  durationMs?: number
  attempt?: number
  errorSnippet?: string
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

function deriveTimeline(
  createdAt: Date,
  currentStage: DemandStage,
  agentRuns: AgentRun[]
): TimelineEvent[] {
  const events: TimelineEvent[] = []

  // 1. Demand creation
  events.push({
    id: "created",
    timestamp: new Date(createdAt),
    type: "created",
  })

  // 2. Build events from agent runs (sorted by createdAt)
  const sorted = [...agentRuns].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )

  for (const run of sorted) {
    events.push({
      id: `${run.id}-start`,
      timestamp: new Date(run.createdAt),
      type: "agent_start",
      phase: run.phase,
      status: run.status,
      attempt: run.attempt > 1 ? run.attempt : undefined,
    })

    if (run.status === "completed" || run.status === "failed" || run.status === "timeout") {
      const endTime = new Date(
        new Date(run.createdAt).getTime() + (run.durationMs || 0)
      )
      events.push({
        id: `${run.id}-end`,
        timestamp: endTime,
        type: "agent_end",
        phase: run.phase,
        status: run.status,
        durationMs: run.durationMs,
        errorSnippet: run.error ? run.error.slice(0, 100) : undefined,
      })
    }
  }

  // Sort all events chronologically
  events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

  return events
}

function EventIcon({ event }: { event: TimelineEvent }) {
  if (event.type === "created") {
    return <Inbox className="size-4 text-blue-500" />
  }
  if (event.type === "agent_start") {
    if (event.status === "running") {
      return <Loader2 className="size-4 animate-spin text-blue-500" />
    }
    if (event.status === "paused") {
      return <Pause className="size-4 text-yellow-500" />
    }
    return <Circle className="size-4 text-gray-400" />
  }
  if (event.type === "agent_end") {
    if (event.status === "completed") {
      return <CheckCircle2 className="size-4 text-green-500" />
    }
    if (event.status === "failed") {
      return <XCircle className="size-4 text-red-500" />
    }
    if (event.status === "timeout") {
      return <AlertTriangle className="size-4 text-orange-500" />
    }
  }
  return <Circle className="size-4 text-gray-400" />
}

interface ActivityTimelineProps {
  demandId: string
  createdAt: Date
  currentStage: DemandStage
  isAgentActive?: boolean
}

export function ActivityTimeline({
  demandId,
  createdAt,
  currentStage,
  isAgentActive,
}: ActivityTimelineProps) {
  const { t } = useTranslation()
  const wsStatus = useWsStatus()

  const { data, isLoading } = useQuery({
    queryKey: ["agent-runs", demandId],
    queryFn: () =>
      api.get<{ agentRuns: AgentRun[] }>(
        `/api/agent-runs?demandId=${demandId}`
      ),
    refetchInterval:
      wsStatus === "connected" ? false : isAgentActive ? 5000 : false,
  })

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {t("activity.loading")}
      </div>
    )
  }

  const agentRuns = data?.agentRuns ?? []
  const events = deriveTimeline(createdAt, currentStage, agentRuns)

  function getEventLabel(event: TimelineEvent): string {
    if (event.type === "created") {
      return t("activity.demandCreated")
    }
    const phaseLabel = event.phase
      ? t(`stages.${event.phase as "discovery" | "planning" | "development" | "testing"}`)
      : event.phase ?? ""
    if (event.type === "agent_start") {
      return `${phaseLabel} ${t("activity.agentStarted")}`
    }
    if (event.type === "agent_end") {
      if (event.status === "completed") return `${phaseLabel} ${t("activity.agentCompleted")}`
      if (event.status === "failed") return `${phaseLabel} ${t("activity.agentFailed")}`
      if (event.status === "timeout") return `${phaseLabel} ${t("activity.agentTimedOut")}`
      if (event.status === "cancelled") return `${phaseLabel} ${t("activity.agentCancelled")}`
      return `${phaseLabel} ${t("activity.agentCompleted")}`
    }
    return ""
  }

  function getEventDetail(event: TimelineEvent): string | undefined {
    if (event.type === "created") {
      return t("activity.addedToInbox")
    }
    if (event.type === "agent_start" && event.attempt) {
      return `${t("agentRuns.attempt")} ${event.attempt}`
    }
    if (event.errorSnippet) {
      return event.errorSnippet
    }
    return undefined
  }

  if (events.length === 0) {
    return (
      <p className="py-4 text-sm text-muted-foreground">{t("activity.noActivity")}</p>
    )
  }

  return (
    <TooltipProvider>
      <div className="relative space-y-0 pl-6">
        {/* Vertical line */}
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />

        {events.map((event, idx) => (
          <div key={event.id} className="relative flex items-start gap-3 py-2">
            {/* Dot on the line */}
            <div className="absolute -left-6 mt-0.5 flex size-4 items-center justify-center rounded-full bg-background">
              <EventIcon event={event} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-sm leading-tight">{getEventLabel(event)}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-xs text-muted-foreground cursor-default">
                      {formatDistanceToNow(event.timestamp, {
                        addSuffix: true,
                      })}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {event.timestamp.toLocaleString()}
                  </TooltipContent>
                </Tooltip>
                {event.durationMs != null && event.durationMs > 0 && (
                  <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                    <Clock className="size-3" />
                    {formatDuration(event.durationMs)}
                  </span>
                )}
              </div>
              {getEventDetail(event) && (
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                  {getEventDetail(event)}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </TooltipProvider>
  )
}
