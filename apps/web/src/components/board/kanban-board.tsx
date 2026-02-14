"use client"

import { useCallback, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  PIPELINE_STAGES,
  STAGE_LABELS,
  type PipelineStage,
  type DemandPriority,
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
import type { UniqueIdentifier } from "@dnd-kit/core"

interface DemandItem {
  id: string
  title: string
  stage: PipelineStage
  priority: DemandPriority
  totalCostUsd: number
}

interface DemandsResponse {
  demands: DemandItem[]
}

type BoardColumns = Record<PipelineStage, DemandItem[]>

function groupByStage(demands: DemandItem[]): BoardColumns {
  const columns = {} as BoardColumns
  for (const stage of PIPELINE_STAGES) {
    columns[stage] = demands.filter((d) => d.stage === stage)
  }
  return columns
}

export function KanbanBoardView({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient()
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
    (item: DemandItem, _fromColumn: UniqueIdentifier, toColumn: UniqueIdentifier) => {
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
    <ScrollArea className="w-full">
      <div className="min-w-[1400px] pb-4">
        <Kanban
          value={columns}
          onValueChange={handleValueChange}
          onMove={handleMove}
          getItemValue={(item) => item.id}
        >
          <KanbanBoard className="grid auto-cols-[minmax(180px,1fr)] grid-flow-col gap-4">
            {PIPELINE_STAGES.map((stage) => (
              <KanbanColumn
                key={stage}
                value={stage}
                items={(columns[stage] ?? []).map((d) => d.id)}
                className="min-w-[180px]"
              >
                <div className="flex items-center justify-between p-3 border-b">
                  <h3 className="text-sm font-semibold">
                    {STAGE_LABELS[stage]}
                  </h3>
                  <Badge variant="secondary" className="text-xs">
                    {columns[stage]?.length ?? 0}
                  </Badge>
                </div>
                <div className="flex flex-col gap-2 p-2 min-h-[120px]">
                  {(columns[stage] ?? []).map((demand) => (
                    <KanbanItem key={demand.id} value={demand.id}>
                      <DemandCard demand={demand} />
                    </KanbanItem>
                  ))}
                </div>
              </KanbanColumn>
            ))}
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
  )
}
