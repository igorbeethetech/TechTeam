"use client"

import { Badge } from "@/components/ui/badge"
import type { DevelopmentOutput } from "@techteam/shared"
import { AlertTriangle, ExternalLink, GitBranch } from "lucide-react"

interface DevelopmentViewProps {
  branchName: string | null
  prUrl: string | null
  developmentOutput: DevelopmentOutput | null
  rejectionCount: number
}

export function DevelopmentView({
  branchName,
  prUrl,
  developmentOutput,
  rejectionCount,
}: DevelopmentViewProps) {
  return (
    <div className="space-y-6">
      {/* Branch */}
      {branchName && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Branch</h3>
          <div className="flex items-center gap-2 rounded-lg border p-4">
            <GitBranch className="size-4 text-muted-foreground" />
            <Badge variant="outline" className="font-mono text-xs">
              {branchName}
            </Badge>
          </div>
        </div>
      )}

      {/* Pull Request */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">
          Pull Request
        </h3>
        <div className="rounded-lg border p-4">
          {prUrl ? (
            <a
              href={prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-primary underline underline-offset-4 hover:text-primary/80"
            >
              {prUrl}
              <ExternalLink className="size-3.5" />
            </a>
          ) : (
            <p className="text-sm text-muted-foreground">
              PR not yet created
            </p>
          )}
        </div>
      </div>

      {/* Rejection count warning */}
      {rejectionCount > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/30">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="size-4" />
            <span className="text-sm font-medium">
              Rejected {rejectionCount} time{rejectionCount !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      )}

      {/* Development output details */}
      {developmentOutput && (
        <>
          {/* Approach */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              Approach
            </h3>
            <div className="rounded-lg border p-4">
              <p className="text-sm">{developmentOutput.approach}</p>
            </div>
          </div>

          {/* Files Changed */}
          {developmentOutput.filesChanged.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                Files Changed ({developmentOutput.filesChanged.length})
              </h3>
              <div className="rounded-lg border p-4">
                <ul className="space-y-1">
                  {developmentOutput.filesChanged.map((file) => (
                    <li key={file} className="flex items-center gap-2">
                      <span className="size-1.5 rounded-full bg-muted-foreground" />
                      <code className="text-xs">{file}</code>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Commit Message */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              Commit Message
            </h3>
            <div className="rounded-lg border-l-4 border-muted-foreground/30 bg-muted/50 p-4">
              <blockquote className="text-sm italic">
                {developmentOutput.commitMessage}
              </blockquote>
            </div>
          </div>

          {/* Notes */}
          {developmentOutput.notes && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                Notes
              </h3>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  {developmentOutput.notes}
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
