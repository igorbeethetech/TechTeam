"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Clock, Zap, DollarSign, AlertCircle } from "lucide-react"
import type { AgentRun } from "@techteam/shared"
import { useState } from "react"

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

interface AgentRunListProps {
  demandId: string
  isAgentActive?: boolean
}

interface AgentRunsResponse {
  agentRuns: AgentRun[]
}

export function AgentRunList({ demandId, isAgentActive }: AgentRunListProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["agent-runs", demandId],
    queryFn: () =>
      api.get<AgentRunsResponse>(`/api/agent-runs?demandId=${demandId}`),
    refetchInterval: isAgentActive ? 5000 : false,
  })

  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set())

  const toggleError = (runId: string) => {
    setExpandedErrors((prev) => {
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
        <p className="text-sm text-muted-foreground">Loading agent runs...</p>
      </div>
    )
  }

  const runs = data?.agentRuns ?? []

  if (runs.length === 0) {
    return (
      <div className="rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">No agent runs yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {runs.map((run) => (
        <div key={run.id} className="rounded-lg border p-4 space-y-2">
          {/* Top row: phase, status, attempt */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={PHASE_COLORS[run.phase] ?? "bg-gray-100 text-gray-700"}>
              {run.phase}
            </Badge>
            <Badge className={STATUS_COLORS[run.status] ?? "bg-gray-100 text-gray-700"}>
              {run.status}
            </Badge>
            {run.attempt > 1 && (
              <Badge variant="outline" className="text-xs">
                Attempt {run.attempt}/3
              </Badge>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {formatRelativeTime(run.createdAt)}
            </span>
          </div>

          {/* Metrics row */}
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Zap className="size-3.5" />
              <span>
                {run.tokensIn.toLocaleString()} in / {run.tokensOut.toLocaleString()} out
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <DollarSign className="size-3.5" />
              <span>${run.costUsd.toFixed(4)} USD</span>
            </div>
            {run.durationMs > 0 && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="size-3.5" />
                <span>{formatDuration(run.durationMs)}</span>
              </div>
            )}
          </div>

          {/* Error (collapsible) */}
          {run.error && (run.status === "failed" || run.status === "timeout") && (
            <div>
              <button
                type="button"
                onClick={() => toggleError(run.id)}
                className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700 dark:text-red-400"
              >
                <AlertCircle className="size-3.5" />
                {expandedErrors.has(run.id) ? "Hide error" : "Show error"}
              </button>
              {expandedErrors.has(run.id) && (
                <pre className="mt-1 overflow-auto rounded bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-400">
                  {run.error}
                </pre>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
