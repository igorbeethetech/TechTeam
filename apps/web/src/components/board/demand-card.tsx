"use client"

import { Badge } from "@/components/ui/badge"
import type { DemandPriority } from "@techteam/shared"

const PRIORITY_COLORS: Record<DemandPriority, string> = {
  low: "bg-slate-100 text-slate-700 hover:bg-slate-100",
  medium: "bg-blue-100 text-blue-700 hover:bg-blue-100",
  high: "bg-orange-100 text-orange-700 hover:bg-orange-100",
  urgent: "bg-red-100 text-red-700 hover:bg-red-100",
}

interface DemandCardProps {
  demand: {
    id: string
    title: string
    priority: DemandPriority
    totalCostUsd: number
  }
}

export function DemandCard({ demand }: DemandCardProps) {
  return (
    <div className="rounded-lg border bg-card p-3 shadow-sm cursor-grab active:cursor-grabbing">
      <p className="text-sm font-medium line-clamp-2">{demand.title}</p>
      <div className="mt-2 flex items-center justify-between">
        <Badge className={PRIORITY_COLORS[demand.priority] ?? PRIORITY_COLORS.medium}>
          {demand.priority}
        </Badge>
        {demand.totalCostUsd > 0 && (
          <span className="text-xs text-muted-foreground">
            ${demand.totalCostUsd.toFixed(2)}
          </span>
        )}
      </div>
    </div>
  )
}
