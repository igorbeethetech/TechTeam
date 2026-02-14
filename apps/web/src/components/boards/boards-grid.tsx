"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { BoardCard } from "./board-card"
import type { PipelineStage } from "@techteam/shared"

interface ProjectBoard {
  id: string
  name: string
  demandCounts: Partial<Record<PipelineStage, number>>
}

interface BoardsResponse {
  projects: ProjectBoard[]
}

export function BoardsGrid() {
  const { data, isLoading } = useQuery({
    queryKey: ["projects", "boards"],
    queryFn: () => api.get<BoardsResponse>("/api/projects/boards"),
  })

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-36 animate-pulse rounded-lg border bg-muted/40" />
        ))}
      </div>
    )
  }

  const projects = data?.projects ?? []

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground">No active projects found.</p>
        <p className="text-sm text-muted-foreground mt-1">Create a project to see its board here.</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => (
        <BoardCard key={project.id} project={project} />
      ))}
    </div>
  )
}
