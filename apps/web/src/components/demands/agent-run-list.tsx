"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useWsStatus } from "@/hooks/use-websocket"
import { Badge } from "@/components/ui/badge"
import {
  Clock,
  Zap,
  DollarSign,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  FileText,
  CheckCircle2,
  XCircle,
  Sparkles,
} from "lucide-react"
import type {
  AgentRun,
  DiscoveryOutput,
  PlanningOutput,
  DevelopmentOutput,
  TestingOutput,
} from "@techteam/shared"
import { useState } from "react"
import { useTranslation } from "@/i18n/language-context"

const PHASE_COLORS: Record<string, string> = {
  discovery: "bg-violet-100 text-violet-700 hover:bg-violet-100",
  planning: "bg-indigo-100 text-indigo-700 hover:bg-indigo-100",
  development: "bg-cyan-100 text-cyan-700 hover:bg-cyan-100",
  testing: "bg-teal-100 text-teal-700 hover:bg-teal-100",
  merge: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
}

const STATUS_COLORS: Record<string, string> = {
  queued: "bg-gray-100 text-gray-700 hover:bg-gray-100",
  running: "bg-blue-100 text-blue-700 hover:bg-blue-100 animate-pulse",
  completed: "bg-green-100 text-green-700 hover:bg-green-100",
  failed: "bg-red-100 text-red-700 hover:bg-red-100",
  timeout: "bg-orange-100 text-orange-700 hover:bg-orange-100",
  paused: "bg-yellow-100 text-yellow-700 hover:bg-yellow-100",
  cancelled: "bg-gray-100 text-gray-500 hover:bg-gray-100",
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - new Date(date).getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  if (diffSeconds < 60) return "just now"
  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

/** Renders structured output for Discovery phase */
function DiscoveryOutputView({ output }: { output: DiscoveryOutput }) {
  return (
    <div className="space-y-3">
      <p className="text-sm">{output.summary}</p>
      {output.functionalRequirements.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">
            Functional Requirements ({output.functionalRequirements.length})
          </p>
          <ul className="space-y-1">
            {output.functionalRequirements.map((req) => (
              <li key={req.id} className="text-xs">
                <span className="font-mono text-muted-foreground">
                  {req.id}
                </span>{" "}
                {req.description}
              </li>
            ))}
          </ul>
        </div>
      )}
      {output.ambiguities.length > 0 && (
        <div>
          <p className="text-xs font-medium text-orange-600 mb-1">
            Ambiguities ({output.ambiguities.length})
          </p>
          <ul className="space-y-1">
            {output.ambiguities.map((a, i) => (
              <li key={i} className="text-xs text-orange-700">
                {a.question}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Badge variant="outline" className="text-xs">
        Complexity: {output.complexity}
      </Badge>
    </div>
  )
}

/** Renders structured output for Planning phase */
function PlanningOutputView({ output }: { output: PlanningOutput }) {
  return (
    <div className="space-y-3">
      <p className="text-sm">{output.summary}</p>
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1">
          Tasks ({output.tasks.length})
        </p>
        <ol className="space-y-1.5">
          {output.executionOrder.map((taskId) => {
            const task = output.tasks.find((t) => t.id === taskId)
            if (!task) return null
            return (
              <li key={taskId} className="text-xs">
                <span className="font-mono text-muted-foreground">
                  {task.id}
                </span>{" "}
                <span className="font-medium">{task.title}</span>
                <span className="ml-1 text-muted-foreground">
                  ({task.files.length} files, {task.estimatedComplexity})
                </span>
              </li>
            )
          })}
        </ol>
      </div>
      {output.riskAreas.length > 0 && (
        <div>
          <p className="text-xs font-medium text-orange-600 mb-1">
            Risk Areas
          </p>
          <ul className="space-y-0.5">
            {output.riskAreas.map((r, i) => (
              <li key={i} className="text-xs text-orange-700">
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Renders structured output for Development phase */
function DevelopmentOutputView({ output }: { output: DevelopmentOutput }) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-0.5">
          Approach
        </p>
        <p className="text-sm">{output.approach}</p>
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1">
          Files Changed ({output.filesChanged.length})
        </p>
        <ul className="space-y-0.5">
          {output.filesChanged.map((f) => (
            <li key={f} className="flex items-center gap-1.5 text-xs">
              <FileText className="size-3 text-muted-foreground" />
              <code className="font-mono">{f}</code>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-0.5">
          Commit
        </p>
        <code className="text-xs font-mono">{output.commitMessage}</code>
      </div>
      {output.notes && (
        <p className="text-xs text-muted-foreground">{output.notes}</p>
      )}
    </div>
  )
}

/** Renders structured output for Testing phase */
function TestingOutputView({ output }: { output: TestingOutput }) {
  const approved = output.verdict === "approved"
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {approved ? (
          <CheckCircle2 className="size-4 text-green-500" />
        ) : (
          <XCircle className="size-4 text-red-500" />
        )}
        <span
          className={`text-sm font-medium ${approved ? "text-green-700" : "text-red-700"}`}
        >
          {approved ? "Approved" : "Rejected"}
        </span>
      </div>
      <p className="text-sm">{output.summary}</p>
      {output.testResults.testsRan && (
        <div className="text-xs">
          <span className="font-medium text-muted-foreground">Tests: </span>
          <span
            className={
              output.testResults.testsPassed
                ? "text-green-700"
                : "text-red-700"
            }
          >
            {output.testResults.testsPassed ? "Passed" : "Failed"}
          </span>
        </div>
      )}
      {output.codeQuality.issues.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">
            Issues ({output.codeQuality.issues.length})
          </p>
          <ul className="space-y-1">
            {output.codeQuality.issues.map((issue, i) => (
              <li key={i} className="text-xs">
                <Badge
                  variant="outline"
                  className={`text-[10px] mr-1 ${
                    issue.severity === "critical"
                      ? "border-red-300 text-red-700"
                      : issue.severity === "major"
                        ? "border-orange-300 text-orange-700"
                        : "border-gray-300"
                  }`}
                >
                  {issue.severity}
                </Badge>
                <code className="font-mono text-muted-foreground">
                  {issue.file}
                </code>{" "}
                - {issue.description}
              </li>
            ))}
          </ul>
        </div>
      )}
      {output.rejectionReasons && output.rejectionReasons.length > 0 && (
        <div>
          <p className="text-xs font-medium text-red-600 mb-1">
            Rejection Reasons
          </p>
          <ul className="space-y-0.5">
            {output.rejectionReasons.map((r, i) => (
              <li key={i} className="text-xs text-red-700">
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Renders output based on phase type */
function PhaseOutput({
  phase,
  output,
}: {
  phase: string
  output: unknown
}) {
  if (!output || typeof output !== "object") return null

  switch (phase) {
    case "discovery":
      return <DiscoveryOutputView output={output as DiscoveryOutput} />
    case "planning":
      return <PlanningOutputView output={output as PlanningOutput} />
    case "development":
      return <DevelopmentOutputView output={output as DevelopmentOutput} />
    case "testing":
      return <TestingOutputView output={output as TestingOutput} />
    default:
      return (
        <pre className="overflow-auto rounded bg-muted p-2 text-xs">
          {JSON.stringify(output, null, 2)}
        </pre>
      )
  }
}

interface AgentRunListProps {
  demandId: string
  isAgentActive?: boolean
}

interface AgentRunsResponse {
  agentRuns: AgentRun[]
}

export function AgentRunList({ demandId, isAgentActive }: AgentRunListProps) {
  const { t } = useTranslation()
  const wsStatus = useWsStatus()

  const { data, isLoading } = useQuery({
    queryKey: ["agent-runs", demandId],
    queryFn: () =>
      api.get<AgentRunsResponse>(`/api/agent-runs?demandId=${demandId}`),
    refetchInterval:
      wsStatus === "connected" ? false : isAgentActive ? 5000 : false,
  })

  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set())

  const toggleRun = (runId: string) => {
    setExpandedRuns((prev) => {
      const next = new Set(prev)
      if (next.has(runId)) {
        next.delete(runId)
      } else {
        next.add(runId)
      }
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">{t("agentRuns.loading")}</p>
      </div>
    )
  }

  const runs = data?.agentRuns ?? []

  if (runs.length === 0) {
    return (
      <div className="rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">{t("agentRuns.noRuns")}</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {runs.map((run) => {
        const isExpanded = expandedRuns.has(run.id)
        const hasOutput = !!(
          run.output && typeof run.output === "object" && run.status === "completed"
        )
        const hasError = !!(
          run.error && (run.status === "failed" || run.status === "timeout" || run.status === "cancelled")
        )
        const hasTokens = run.tokensIn > 0 || run.tokensOut > 0

        return (
          <div key={run.id} className="rounded-lg border">
            {/* Header - always visible, clickable */}
            <button
              type="button"
              onClick={() => toggleRun(run.id)}
              className="flex w-full items-center gap-2 p-4 text-left hover:bg-muted/50 transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              )}

              <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                <Badge
                  className={
                    PHASE_COLORS[run.phase] ?? "bg-gray-100 text-gray-700"
                  }
                >
                  {t(`stages.${run.phase as "discovery" | "planning" | "development" | "testing"}`)}
                </Badge>
                <Badge
                  className={
                    STATUS_COLORS[run.status] ?? "bg-gray-100 text-gray-700"
                  }
                >
                  {run.status}
                </Badge>
                {run.attempt > 1 && (
                  <Badge variant="outline" className="text-xs">
                    {t("agentRuns.attempt")} {run.attempt}/3
                  </Badge>
                )}
                {run.skillsUsed && run.skillsUsed.length > 0 && (
                  <div className="flex items-center gap-1">
                    <Sparkles className="size-3 text-amber-500" />
                    {run.skillsUsed.slice(0, 3).map((skill) => (
                      <Badge
                        key={skill}
                        className="text-[10px] bg-amber-100 text-amber-700 hover:bg-amber-100"
                      >
                        {skill}
                      </Badge>
                    ))}
                    {run.skillsUsed.length > 3 && (
                      <Badge className="text-[10px] bg-amber-100 text-amber-700 hover:bg-amber-100">
                        +{run.skillsUsed.length - 3}
                      </Badge>
                    )}
                  </div>
                )}

                {/* Metrics inline */}
                <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
                  {run.durationMs > 0 && (
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" />
                      {formatDuration(run.durationMs)}
                    </span>
                  )}
                  {(run.tokensIn > 0 || run.tokensOut > 0) && (
                    <span className="flex items-center gap-1">
                      <Zap className="size-3" />
                      {(run.tokensIn + run.tokensOut).toLocaleString()}
                    </span>
                  )}
                  {run.costUsd > 0 && (
                    <span className="flex items-center gap-1">
                      <DollarSign className="size-3" />$
                      {run.costUsd.toFixed(4)}
                    </span>
                  )}
                  <span>{formatRelativeTime(run.createdAt)}</span>
                </div>
              </div>
            </button>

            {/* Expanded content */}
            {isExpanded && (
              <div className="border-t px-4 py-3 space-y-3">
                {/* Token breakdown */}
                {hasTokens && (
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>
                      {t("agentRuns.tokensIn")}: {run.tokensIn.toLocaleString()}
                    </span>
                    <span>
                      {t("agentRuns.tokensOut")}: {run.tokensOut.toLocaleString()}
                    </span>
                    <span>{t("agentRuns.cost")}: ${run.costUsd.toFixed(4)} USD</span>
                  </div>
                )}

                {/* Phase-specific structured output */}
                {hasOutput && (
                  <div className="rounded-md border bg-muted/30 p-3">
                    <PhaseOutput phase={run.phase} output={run.output} />
                  </div>
                )}

                {/* Error details */}
                {hasError && (
                  <div className="rounded-md border border-red-200 bg-red-50/50 p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <AlertCircle className="size-3.5 text-red-600" />
                      <span className="text-xs font-medium text-red-700">
                        {t("agentRuns.error")}
                      </span>
                    </div>
                    <pre className="overflow-auto text-xs text-red-700 whitespace-pre-wrap">
                      {run.error}
                    </pre>
                  </div>
                )}

                {!hasOutput && !hasError && (
                  <p className="text-xs text-muted-foreground">
                    {run.status === "running" || run.status === "queued"
                      ? t("agentRuns.executing")
                      : t("agentRuns.noOutput")}
                  </p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
