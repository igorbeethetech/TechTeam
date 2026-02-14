"use client"

import { useRouter } from "next/navigation"
import { GripVertical } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useKanbanItemHandle } from "@/components/ui/kanban"
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
  const router = useRouter()
  const { listeners, attributes, setActivatorNodeRef, isDragging } = useKanbanItemHandle()

  function handleCardClick() {
    // Don't navigate if we just finished a drag
    if (isDragging) return
    router.push(`/demands/${demand.id}`)
  }

  return (
    <div
      className="rounded-lg border bg-card p-3 shadow-sm hover:border-primary/50 hover:shadow-md transition-all cursor-pointer"
      onClick={handleCardClick}
    >
      <div className="flex items-start gap-2">
        {/* Drag handle -- only this element is draggable */}
        <button
          ref={setActivatorNodeRef}
          {...listeners}
          {...attributes}
          className="mt-0.5 shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="size-4" />
        </button>
        {/* Card content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium line-clamp-2">{demand.title}</p>
          <div className="mt-2 flex items-center gap-2">
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
      </div>
    </div>
  )
}
