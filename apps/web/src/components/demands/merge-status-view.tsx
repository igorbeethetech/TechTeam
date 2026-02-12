"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  GitBranch,
  GitMerge,
  Loader2,
  RefreshCw,
} from "lucide-react"
import { api } from "@/lib/api"

interface MergeStatusViewProps {
  demandId: string
  mergeStatus: string | null
  mergeConflicts: unknown
  mergeAttempts: number
  prUrl: string | null
  branchName: string | null
}

interface ParsedConflicts {
  files?: string[]
  attemptedAI?: boolean
  mergeAttempts?: number
}

const STATUS_CONFIG: Record<
  string,
  { color: string; icon: React.ReactNode; label: string }
> = {
  pending: {
    color: "bg-blue-100 text-blue-700 hover:bg-blue-100",
    icon: <GitMerge className="size-3.5" />,
    label: "Merge Pending",
  },
  auto_merged: {
    color: "bg-green-100 text-green-700 hover:bg-green-100",
    icon: <CheckCircle2 className="size-3.5" />,
    label: "Auto-Merged",
  },
  conflict_resolving: {
    color: "bg-blue-100 text-blue-700 hover:bg-blue-100 animate-pulse",
    icon: <Loader2 className="size-3.5 animate-spin" />,
    label: "AI Resolving Conflicts",
  },
  needs_human: {
    color: "bg-amber-100 text-amber-700 hover:bg-amber-100",
    icon: <AlertTriangle className="size-3.5" />,
    label: "Needs Human Resolution",
  },
  merged: {
    color: "bg-green-100 text-green-700 hover:bg-green-100",
    icon: <CheckCircle2 className="size-3.5" />,
    label: "Merged",
  },
}

export function MergeStatusView({
  demandId,
  mergeStatus,
  mergeConflicts,
  mergeAttempts,
  prUrl,
  branchName,
}: MergeStatusViewProps) {
  const [isRetrying, setIsRetrying] = useState(false)
  const [retrySuccess, setRetrySuccess] = useState(false)

  const statusConfig = mergeStatus ? STATUS_CONFIG[mergeStatus] : null

  const conflicts = mergeConflicts as ParsedConflicts | null

  async function handleRetry() {
    setIsRetrying(true)
    setRetrySuccess(false)
    try {
      await api.post(`/api/demands/${demandId}/merge/retry`)
      setRetrySuccess(true)
    } catch (error) {
      console.error("[MergeStatusView] Retry merge failed:", error)
    } finally {
      setIsRetrying(false)
    }
  }

  return (
    <div className="rounded-lg border p-4 space-y-4">
      {/* Status badge */}
      {statusConfig && (
        <div className="flex items-center gap-2">
          <Badge className={statusConfig.color}>
            <span className="mr-1.5 inline-flex">{statusConfig.icon}</span>
            {statusConfig.label}
          </Badge>
        </div>
      )}

      {/* Conflict details (needs_human only) */}
      {mergeStatus === "needs_human" && conflicts && (
        <div className="space-y-3">
          {conflicts.files && conflicts.files.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                Conflicted Files
              </h3>
              <div className="rounded bg-muted p-3">
                <ul className="space-y-1">
                  {conflicts.files.map((file) => (
                    <li key={file} className="flex items-center gap-2">
                      <span className="size-1.5 rounded-full bg-amber-500" />
                      <code className="text-xs">{file}</code>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {conflicts.attemptedAI && (
            <p className="text-sm text-muted-foreground">
              AI conflict resolution was attempted but could not resolve all
              conflicts.
            </p>
          )}

          <p className="text-sm text-muted-foreground">
            Merge attempts: {mergeAttempts}
          </p>
        </div>
      )}

      {/* Retry button (needs_human only) */}
      {mergeStatus === "needs_human" && (
        <div className="space-y-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleRetry}
            disabled={isRetrying}
          >
            {isRetrying ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 size-4" />
            )}
            Retry Merge
          </Button>
          {retrySuccess && (
            <p className="text-sm text-green-600">
              Merge retry enqueued successfully.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Resolve the conflicts in your IDE or GitHub, push your changes, then
            click Retry Merge.
          </p>
        </div>
      )}

      {/* PR and branch links */}
      {(prUrl || branchName) && (
        <div className="space-y-3">
          {prUrl && (
            <div className="flex items-center gap-2">
              <a
                href={prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-primary underline underline-offset-4 hover:text-primary/80"
              >
                View Pull Request
                <ExternalLink className="size-3.5" />
              </a>
            </div>
          )}
          {branchName && (
            <div className="flex items-center gap-2">
              <GitBranch className="size-4 text-muted-foreground" />
              <Badge variant="outline" className="font-mono text-xs">
                {branchName}
              </Badge>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
