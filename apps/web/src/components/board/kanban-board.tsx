"use client"

import { useCallback, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  PIPELINE_STAGES,
  type PipelineStage,
  type DemandPriority,
  type DemandStage,
} from "@techteam/shared"
import { api } from "@/lib/api"
import { useWsStatus } from "@/hooks/use-websocket"
import {
  Kanban,
  KanbanBoard,
  KanbanColumn,
  KanbanItem,
  KanbanOverlay,
} from "@/components/ui/kanban"
import { DemandCard } from "./demand-card"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import {
  Inbox,
  Search,
  ClipboardList,
  Code2,
  TestTube2,
  ClipboardCheck,
  CheckCircle2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useTranslation } from "@/i18n/language-context"
import type { UniqueIdentifier } from "@dnd-kit/core"

interface DemandItem {
  id: string
  title: string
  stage: DemandStage
  priority: DemandPriority
  totalCostUsd: number
  agentStatus: string | null
  prUrl: string | null
  createdAt: string | Date
}

interface DemandsResponse {
  demands: DemandItem[]
}

type BoardColumns = Record<PipelineStage, DemandItem[]>

const COLUMN_ICONS: Record<PipelineStage, typeof Inbox> = {
  inbox: Inbox,
  discovery: Search,
  planning: ClipboardList,
  development: Code2,
  testing: TestTube2,
  review: ClipboardCheck,
  done: CheckCircle2,
}

const COLUMN_EMPTY_KEYS: Record<PipelineStage, string> = {
  inbox: "board.emptyInbox",
  discovery: "board.emptyDiscovery",
  planning: "board.emptyPlanning",
  development: "board.emptyDevelopment",
  testing: "board.emptyTesting",
  review: "board.emptyReview",
  done: "board.emptyDone",
}

const STAGE_LABEL_KEYS: Record<PipelineStage, string> = {
  inbox: "stages.inbox",
  discovery: "stages.discovery",
  planning: "stages.planning",
  development: "stages.development",
  testing: "stages.testing",
  review: "stages.review",
  done: "stages.done",
}

function groupByStage(demands: DemandItem[]): BoardColumns {
  const columns = {} as BoardColumns
  for (const stage of PIPELINE_STAGES) {
    columns[stage] = demands.filter((d) => {
      // Map legacy "merge" stage demands to "review" column
      const displayStage = d.stage === "merge" ? "review" : d.stage
      return displayStage === stage
    })
  }
  return columns
}

function BoardStats({ demands }: { demands: DemandItem[] }) {
  const { t } = useTranslation()
  const total = demands.length
  const inProgress = demands.filter((d) =>
    ["discovery", "planning", "development", "testing"].includes(d.stage)
  ).length
  const awaitingReview = demands.filter(
    (d) => d.stage === "review" || d.stage === "merge"
  ).length
  const done = demands.filter((d) => d.stage === "done").length

  if (total === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-4 px-1 pb-3 text-sm">
      <span className="text-muted-foreground">
        <span className="font-semibold text-foreground">{total}</span> {t("board.total")}
      </span>
      {inProgress > 0 && (
        <span className="text-muted-foreground">
          <span className="font-semibold text-blue-600">{inProgress}</span>{" "}
          {t("board.inProgress")}
        </span>
      )}
      {awaitingReview > 0 && (
        <span className="text-muted-foreground">
          <span className="font-semibold text-amber-600">
            {awaitingReview}
          </span>{" "}
          {t("board.awaitingReview")}
        </span>
      )}
      {done > 0 && (
        <span className="text-muted-foreground">
          <span className="font-semibold text-green-600">{done}</span> {t("board.done")}
        </span>
      )}
    </div>
  )
}

export function KanbanBoardView({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const wsStatus = useWsStatus()

  // Fetch demands -- WS events invalidate when connected, poll as fallback
  const { data: demandsData } = useQuery({
    queryKey: ["demands", projectId],
    queryFn: () =>
      api.get<DemandsResponse>(`/api/demands?projectId=${projectId}`),
    refetchInterval: wsStatus === "connected" ? false : 5000,
    refetchIntervalInBackground: false,
  })

  const demands = demandsData?.demands ?? []
  const columns = useMemo(() => groupByStage(demands), [demands])

  // Optimistic stage update on drag
  const moveCard = useMutation({
    mutationFn: (vars: { demandId: string; newStage: PipelineStage }) =>
      api.patch(`/api/demands/${vars.demandId}/stage`, {
        stage: vars.newStage,
      }),
    onMutate: async ({ demandId, newStage }) => {
      await queryClient.cancelQueries({ queryKey: ["demands", projectId] })
      const previous = queryClient.getQueryData<DemandsResponse>([
        "demands",
        projectId,
      ])
      queryClient.setQueryData<DemandsResponse>(
        ["demands", projectId],
        (old) => {
          if (!old) return old
          return {
            demands: old.demands.map((d) =>
              d.id === demandId ? { ...d, stage: newStage } : d
            ),
          }
        }
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["demands", projectId], context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["demands", projectId] })
    },
  })

  // When an item is moved to a different column via drag
  const handleMove = useCallback(
    (
      item: DemandItem,
      _fromColumn: UniqueIdentifier,
      toColumn: UniqueIdentifier
    ) => {
      const newStage = String(toColumn) as PipelineStage
      if (PIPELINE_STAGES.includes(newStage) && item.stage !== newStage) {
        moveCard.mutate({ demandId: item.id, newStage })
      }
    },
    [moveCard]
  )

  // Handle value change from Kanban (includes cross-column detection)
  const handleValueChange = useCallback(
    (newColumns: Record<UniqueIdentifier, DemandItem[]>) => {
      // Detect items that moved to a different column
      for (const stage of PIPELINE_STAGES) {
        const items = newColumns[stage] ?? []
        for (const item of items) {
          if (item.stage !== stage) {
            moveCard.mutate({ demandId: item.id, newStage: stage })
          }
        }
      }

      // Update local cache optimistically
      const updatedDemands: DemandItem[] = []
      for (const stage of PIPELINE_STAGES) {
        const items = newColumns[stage] ?? []
        for (const item of items) {
          updatedDemands.push({ ...item, stage })
        }
      }
      queryClient.setQueryData<DemandsResponse>(["demands", projectId], {
        demands: updatedDemands,
      })
    },
    [moveCard, queryClient, projectId]
  )

  return (
    <div>
      <BoardStats demands={demands} />
      <ScrollArea className="w-full">
        <div className="min-w-[1400px] pb-4">
          <Kanban
            value={columns}
            onValueChange={handleValueChange}
            onMove={handleMove}
            getItemValue={(item) => item.id}
          >
            <KanbanBoard className="grid auto-cols-[minmax(180px,1fr)] grid-flow-col gap-4">
              {PIPELINE_STAGES.map((stage) => {
                const Icon = COLUMN_ICONS[stage]
                const count = columns[stage]?.length ?? 0
                const isReview = stage === "review"

                return (
                  <KanbanColumn
                    key={stage}
                    value={stage}
                    items={(columns[stage] ?? []).map((d) => d.id)}
                    className={cn(
                      "min-w-[180px] rounded-lg",
                      isReview && "bg-amber-50/50 ring-1 ring-amber-200"
                    )}
                  >
                    <div
                      className={cn(
                        "flex items-center gap-2 p-3 border-b",
                        isReview && "border-amber-200"
                      )}
                    >
                      <Icon
                        className={cn(
                          "size-4 shrink-0 text-muted-foreground",
                          isReview && "text-amber-600"
                        )}
                      />
                      <h3
                        className={cn(
                          "text-sm font-semibold flex-1",
                          isReview && "text-amber-800"
                        )}
                      >
                        {t(STAGE_LABEL_KEYS[stage] as any)}
                      </h3>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-xs",
                          isReview &&
                            count > 0 &&
                            "bg-amber-200 text-amber-800"
                        )}
                      >
                        {count}
                      </Badge>
                    </div>
                    <div className="flex flex-col gap-2 p-2 min-h-[120px]">
                      {count === 0 ? (
                        <p className="py-6 text-center text-xs text-muted-foreground">
                          {t(COLUMN_EMPTY_KEYS[stage] as any)}
                        </p>
                      ) : (
                        (columns[stage] ?? []).map((demand) => (
                          <KanbanItem key={demand.id} value={demand.id}>
                            <DemandCard demand={demand} />
                          </KanbanItem>
                        ))
                      )}
                    </div>
                  </KanbanColumn>
                )
              })}
            </KanbanBoard>
            <KanbanOverlay>
              {({ value }) => {
                const demand = demands.find((d) => d.id === value)
                return demand ? <DemandCard demand={demand} /> : null
              }}
            </KanbanOverlay>
          </Kanban>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  )
}
