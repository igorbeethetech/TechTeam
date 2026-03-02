"use client"

import { useRouter } from "next/navigation"
import { GripVertical, ExternalLink } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useKanbanItemHandle } from "@/components/ui/kanban"
import { formatDistanceToNow } from "date-fns"
import type { DemandPriority } from "@techteam/shared"

const PRIORITY_BORDER: Record<DemandPriority, string> = {
  low: "border-l-slate-300",
  medium: "border-l-blue-400",
  high: "border-l-orange-400",
  urgent: "border-l-red-500",
}

const PRIORITY_LABELS: Record<DemandPriority, string> = {
  low: "Low",
  medium: "Med",
  high: "High",
  urgent: "Urgent",
}

const PRIORITY_COLORS: Record<DemandPriority, string> = {
  low: "bg-slate-100 text-slate-700 hover:bg-slate-100",
  medium: "bg-blue-100 text-blue-700 hover:bg-blue-100",
  high: "bg-orange-100 text-orange-700 hover:bg-orange-100",
  urgent: "bg-red-100 text-red-700 hover:bg-red-100",
}

const AGENT_DOT: Record<string, string> = {
  running: "bg-blue-500 animate-pulse",
  queued: "bg-gray-400",
  completed: "bg-green-500",
  failed: "bg-red-500",
  timeout: "bg-orange-500",
  paused: "bg-yellow-500",
}

interface DemandCardProps {
  demand: {
    id: string
    title: string
    priority: DemandPriority
    totalCostUsd: number
    agentStatus?: string | null
    prUrl?: string | null
    createdAt?: string | Date
  }
}

export function DemandCard({ demand }: DemandCardProps) {
  const router = useRouter()
  const { listeners, attributes, setActivatorNodeRef, isDragging } =
    useKanbanItemHandle()

  function handleCardClick() {
    if (isDragging) return
    router.push(`/demands/${demand.id}`)
  }

  return (
    <div
      className={`rounded-lg border border-l-[3px] ${
        PRIORITY_BORDER[demand.priority] ?? PRIORITY_BORDER.medium
      } bg-card p-3 shadow-sm hover:border-primary/50 hover:shadow-md transition-all cursor-pointer`}
      onClick={handleCardClick}
    >
      <div className="flex items-start gap-2">
        {/* Drag handle */}
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
          {/* Title */}
          <p className="text-sm font-medium line-clamp-2 leading-tight">
            {demand.title}
          </p>

          {/* Bottom row: priority + status + cost/time */}
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <Badge
              className={`text-[10px] px-1.5 py-0 h-5 ${
                PRIORITY_COLORS[demand.priority] ?? PRIORITY_COLORS.medium
              }`}
            >
              {PRIORITY_LABELS[demand.priority] ?? demand.priority}
            </Badge>

            {/* Agent status dot */}
            {demand.agentStatus && AGENT_DOT[demand.agentStatus] && (
              <span
                className={`inline-block size-2 rounded-full ${AGENT_DOT[demand.agentStatus]}`}
                title={`Agent: ${demand.agentStatus}`}
              />
            )}

            {/* PR link indicator */}
            {demand.prUrl && (
              <a
                href={demand.prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-[10px] text-blue-600 hover:text-blue-800"
                onClick={(e) => e.stopPropagation()}
                title="Open PR"
              >
                <ExternalLink className="size-3" />
                PR
              </a>
            )}

            {/* Cost + time (right-aligned) */}
            <span className="ml-auto flex items-center gap-2 text-[10px] text-muted-foreground">
              {demand.totalCostUsd > 0 && (
                <span>${demand.totalCostUsd.toFixed(2)}</span>
              )}
              {demand.createdAt && (
                <span>
                  {formatDistanceToNow(new Date(demand.createdAt), {
                    addSuffix: false,
                  })}
                </span>
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
