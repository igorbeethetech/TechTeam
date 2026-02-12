"use client"

import { use } from "react"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { ArrowLeft, Loader2 } from "lucide-react"
import Link from "next/link"
import { api } from "@/lib/api"
import { BoardHeader } from "@/components/board/board-header"
import { KanbanBoardView } from "@/components/board/kanban-board"
import { Button } from "@/components/ui/button"
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
  const router = useRouter()

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
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
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
      />
      <KanbanBoardView projectId={projectId} />
    </div>
  )
}
