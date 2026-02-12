"use client"

import Link from "next/link"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, FolderOpen } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { ProjectCard } from "./project-card"
import type { Project } from "@techteam/shared"

interface ProjectsResponse {
  projects: Project[]
}

export function ProjectList() {
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.get<ProjectsResponse>("/api/projects"),
  })

  const archiveMutation = useMutation({
    mutationFn: (id: string) =>
      api.patch<{ project: Project }>(`/api/projects/${id}/archive`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] })
      toast.success("Project archived successfully")
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to archive project")
    },
  })

  const unarchiveMutation = useMutation({
    mutationFn: (id: string) =>
      api.patch<{ project: Project }>(`/api/projects/${id}/unarchive`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] })
      toast.success("Project unarchived successfully")
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to unarchive project")
    },
  })

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-48 animate-pulse rounded-xl border bg-muted"
          />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12 text-destructive">
        <p>Failed to load projects: {error.message}</p>
      </div>
    )
  }

  const projects = data?.projects ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Projects</h2>
        <Button asChild>
          <Link href="/projects/new">
            <Plus className="size-4" />
            New Project
          </Link>
        </Button>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <FolderOpen className="size-12 text-muted-foreground" />
          <div>
            <h3 className="text-lg font-medium">No projects yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your first project to get started.
            </p>
          </div>
          <Button asChild>
            <Link href="/projects/new">
              <Plus className="size-4" />
              Create your first project
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onArchive={(id) => archiveMutation.mutate(id)}
              onUnarchive={(id) => unarchiveMutation.mutate(id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
