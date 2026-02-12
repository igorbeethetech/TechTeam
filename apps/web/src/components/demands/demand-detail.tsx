"use client"

import Link from "next/link"
import { ArrowLeft, Calendar, User, Zap } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PipelineProgress } from "./pipeline-progress"
import { STAGE_LABELS, type Demand, type DemandPriority, type PipelineStage } from "@techteam/shared"

const PRIORITY_COLORS: Record<DemandPriority, string> = {
  low: "bg-slate-100 text-slate-700 hover:bg-slate-100",
  medium: "bg-blue-100 text-blue-700 hover:bg-blue-100",
  high: "bg-orange-100 text-orange-700 hover:bg-orange-100",
  urgent: "bg-red-100 text-red-700 hover:bg-red-100",
}

interface DemandDetailProps {
  demand: Demand
}

export function DemandDetail({ demand }: DemandDetailProps) {
  return (
    <div className="space-y-8">
      {/* Back navigation */}
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/projects/${demand.projectId}/board`}>
          <ArrowLeft className="size-4" />
          Back to Board
        </Link>
      </Button>

      {/* Title */}
      <div>
        <h1 className="text-3xl font-bold">{demand.title}</h1>
      </div>

      {/* Pipeline progress */}
      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          Pipeline Progress
        </h2>
        <PipelineProgress currentStage={demand.stage as PipelineStage} />
      </div>

      {/* Current stage prominently displayed */}
      <div className="rounded-lg border bg-muted/50 p-4">
        <p className="text-sm text-muted-foreground">Current Stage</p>
        <p className="text-lg font-semibold">
          {STAGE_LABELS[demand.stage as PipelineStage] ?? demand.stage}
        </p>
      </div>

      {/* Metadata */}
      <div className="flex flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Priority:</span>
          <Badge className={PRIORITY_COLORS[demand.priority] ?? PRIORITY_COLORS.medium}>
            {demand.priority.charAt(0).toUpperCase() + demand.priority.slice(1)}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="size-4" />
          {new Date(demand.createdAt).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </div>
        {demand.createdBy && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <User className="size-4" />
            {demand.createdBy}
          </div>
        )}
      </div>

      {/* Description */}
      {demand.description && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Description
          </h2>
          <div className="prose prose-sm max-w-none rounded-lg border p-4">
            <p className="whitespace-pre-wrap">{demand.description}</p>
          </div>
        </div>
      )}

      {/* Cost section */}
      {(demand.totalTokens > 0 || demand.totalCostUsd > 0) && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Cost
          </h2>
          <div className="flex gap-6 rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <Zap className="size-4 text-muted-foreground" />
              <span className="text-sm">
                {demand.totalTokens.toLocaleString()} tokens
              </span>
            </div>
            <div className="text-sm">
              ${demand.totalCostUsd.toFixed(2)} USD
            </div>
          </div>
        </div>
      )}

      {/* Progressive disclosure for future-phase fields */}
      {demand.complexity && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Complexity
          </h2>
          <Badge variant="outline">{demand.complexity}</Badge>
        </div>
      )}

      {demand.requirements != null ? (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Requirements
          </h2>
          <pre className="overflow-auto rounded-lg border bg-muted/50 p-4 text-sm">
            {JSON.stringify(demand.requirements, null, 2)}
          </pre>
        </div>
      ) : null}

      {demand.plan != null ? (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Plan
          </h2>
          <pre className="overflow-auto rounded-lg border bg-muted/50 p-4 text-sm">
            {JSON.stringify(demand.plan, null, 2)}
          </pre>
        </div>
      ) : null}

      {demand.branchName && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Branch
          </h2>
          <code className="rounded bg-muted px-2 py-1 text-sm">
            {demand.branchName}
          </code>
        </div>
      )}

      {demand.prUrl && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Pull Request
          </h2>
          <a
            href={demand.prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary underline"
          >
            {demand.prUrl}
          </a>
        </div>
      )}

      {demand.mergeStatus && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Merge Status
          </h2>
          <Badge variant="outline">
            {demand.mergeStatus.replace(/_/g, " ")}
          </Badge>
        </div>
      )}
    </div>
  )
}
