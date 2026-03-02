"use client"

import { use, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { api } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"
import { useWsStatus } from "@/hooks/use-websocket"
import { BoardHeader } from "@/components/board/board-header"
import { KanbanBoardView } from "@/components/board/kanban-board"
import { DemandForm } from "@/components/demands/demand-form"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import type { Project, Demand } from "@techteam/shared"

interface ProjectResponse {
  project: Project
}

interface DemandsResponse {
  demands: Demand[]
}

export default function BoardPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = use(params)
  const [sheetOpen, setSheetOpen] = useState(false)
  const wsStatus = useWsStatus()

  const {
    data: projectData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api.get<ProjectResponse>(`/api/projects/${projectId}`),
  })

  const { data: demandsData } = useQuery({
    queryKey: ["demands", projectId],
    queryFn: () =>
      api.get<DemandsResponse>(`/api/demands?projectId=${projectId}`),
    refetchInterval: wsStatus === "connected" ? false : 5000,
    refetchIntervalInBackground: false,
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-24" />
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="grid auto-cols-[minmax(180px,1fr)] grid-flow-col gap-4 min-w-[1400px]">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="rounded-lg border">
              <div className="flex items-center justify-between p-3 border-b">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-5 w-8" />
              </div>
              <div className="p-2 space-y-2 min-h-[120px]">
                {i < 3 && <Skeleton className="h-20 w-full" />}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error || !projectData?.project) {
    return (
      <div className="space-y-4 py-10 text-center">
        <p className="text-muted-foreground">Project not found</p>
        <Button variant="outline" asChild>
          <Link href="/projects">
            <ArrowLeft className="size-4" />
            Back to Projects
          </Link>
        </Button>
      </div>
    )
  }

  const project = projectData.project
  const demandCount = demandsData?.demands?.length ?? 0

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/projects">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
      </div>
      <BoardHeader
        projectName={project.name}
        projectId={projectId}
        demandCount={demandCount}
        onNewDemand={() => setSheetOpen(true)}
      />
      <KanbanBoardView projectId={projectId} />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>New Demand</SheetTitle>
            <SheetDescription>
              Create a new demand for {project.name}
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">
            <DemandForm
              projectId={projectId}
              onSuccess={() => setSheetOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
