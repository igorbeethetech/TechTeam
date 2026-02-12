"use client"

import { useParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { api } from "@/lib/api"
import { ProjectForm } from "@/components/projects/project-form"
import { Button } from "@/components/ui/button"
import type { Project } from "@techteam/shared"

interface ProjectResponse {
  project: Project
}

export default function EditProjectPage() {
  const params = useParams<{ id: string }>()

  const { data, isLoading, error } = useQuery({
    queryKey: ["project", params.id],
    queryFn: () => api.get<ProjectResponse>(`/api/projects/${params.id}`),
    enabled: !!params.id,
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-96 max-w-2xl animate-pulse rounded-xl border bg-muted" />
      </div>
    )
  }

  if (error || !data?.project) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <h3 className="text-lg font-medium">Project not found</h3>
        <p className="text-sm text-muted-foreground">
          The project you are looking for does not exist or you do not have
          access to it.
        </p>
        <Button asChild variant="outline">
          <Link href="/projects">Back to Projects</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Edit Project</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Update settings for {data.project.name}.
        </p>
      </div>
      <ProjectForm project={data.project} />
    </div>
  )
}
