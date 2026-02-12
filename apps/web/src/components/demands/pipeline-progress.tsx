"use client"

import { PIPELINE_STAGES, STAGE_LABELS, type PipelineStage } from "@techteam/shared"
import { cn } from "@/lib/utils"

interface PipelineProgressProps {
  currentStage: PipelineStage
}

export function PipelineProgress({ currentStage }: PipelineProgressProps) {
  const currentIndex = PIPELINE_STAGES.indexOf(currentStage)

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center gap-1">
        {PIPELINE_STAGES.map((stage, index) => (
          <div
            key={stage}
            className={cn(
              "h-2 flex-1 rounded-full transition-colors",
              index <= currentIndex ? "bg-primary" : "bg-muted"
            )}
          />
        ))}
      </div>
      <div className="flex items-center gap-1">
        {PIPELINE_STAGES.map((stage, index) => (
          <div key={stage} className="flex-1 text-center">
            <span
              className={cn(
                "text-xs",
                index === currentIndex
                  ? "font-semibold text-primary"
                  : "text-muted-foreground"
              )}
            >
              {STAGE_LABELS[stage]}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
