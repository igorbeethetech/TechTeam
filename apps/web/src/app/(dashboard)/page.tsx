"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { FolderOpen } from "lucide-react"
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

  const projectCount = projectsData?.projects?.length ?? 0

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
