"use client"

import { ExternalLink, GitBranch, Globe, DollarSign, Zap } from "lucide-react"
import { CopyButton } from "@/components/ui/copy-button"

interface QuickInfoBarProps {
  branchName: string | null
  prUrl: string | null
  previewUrl: string | null
  totalCostUsd: number
  totalTokens: number
}

export function QuickInfoBar({
  branchName,
  prUrl,
  previewUrl,
  totalCostUsd,
  totalTokens,
}: QuickInfoBarProps) {
  const hasAnyInfo = branchName || prUrl || previewUrl || totalCostUsd > 0

  if (!hasAnyInfo) return null

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-4 py-2.5">
      {branchName && (
        <div className="flex items-center gap-1.5">
          <GitBranch className="size-3.5 text-muted-foreground" />
          <code className="rounded bg-background px-1.5 py-0.5 text-xs font-mono">
            {branchName}
          </code>
          <CopyButton text={branchName} label="branch" />
        </div>
      )}

      {prUrl && (
        <div className="flex items-center gap-1.5">
          <ExternalLink className="size-3.5 text-muted-foreground" />
          <a
            href={prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 underline hover:text-blue-800"
          >
            PR #{prUrl.split("/").pop()}
          </a>
          <CopyButton text={prUrl} label="PR URL" />
        </div>
      )}

      {previewUrl && (
        <div className="flex items-center gap-1.5">
          <Globe className="size-3.5 text-muted-foreground" />
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 underline hover:text-blue-800"
          >
            Preview
          </a>
        </div>
      )}

      {(totalCostUsd > 0 || totalTokens > 0) && (
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          {totalTokens > 0 && (
            <span className="flex items-center gap-1">
              <Zap className="size-3" />
              {totalTokens.toLocaleString()} tokens
            </span>
          )}
          {totalCostUsd > 0 && (
            <span className="flex items-center gap-1">
              <DollarSign className="size-3" />
              ${totalCostUsd.toFixed(2)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
