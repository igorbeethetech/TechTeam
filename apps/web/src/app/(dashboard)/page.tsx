"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { FolderOpen, Kanban } from "lucide-react"
import { useSession } from "@/lib/auth-client"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Project } from "@techteam/shared"

interface ProjectsResponse {
  projects: Project[]
}

export default function DashboardPage() {
  const { data: session } = useSession()

  const { data: projectsData } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.get<ProjectsResponse>("/api/projects"),
  })

  const projects = projectsData?.projects ?? []
  const projectCount = projects.length

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold">Welcome to TechTeam</h2>
        {session?.user && (
          <p className="mt-1 text-muted-foreground">
            Signed in as {session.user.name}
          </p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Projects
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{projectCount}</div>
          </CardContent>
        </Card>
      </div>

      {projects.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Project Boards</h3>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Card key={project.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{project.name}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {project.techStack}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/projects/${project.id}/board`}>
                      <Kanban className="size-4" />
                      Board
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div>
        <Button asChild>
          <Link href="/projects">
            <FolderOpen className="size-4" />
            Manage Projects
          </Link>
        </Button>
      </div>
    </div>
  )
}
