"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import {
  FolderOpen,
  Kanban,
  ClipboardCheck,
  TrendingUp,
  DollarSign,
  Activity,
  Plus,
  ArrowRight,
} from "lucide-react"
import { useSession } from "@/lib/auth-client"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatDistanceToNow } from "date-fns"
import type { Project, DemandPriority } from "@techteam/shared"
import { STAGE_LABELS, type PipelineStage } from "@techteam/shared"

interface ProjectsResponse {
  projects: Project[]
}

interface DashboardStats {
  stats: {
    activeDemands: number
    awaitingReview: number
    completedThisWeek: number
    totalCostUsd: number
  }
  recentDemands: {
    id: string
    title: string
    stage: string
    agentStatus: string | null
    priority: DemandPriority
    updatedAt: string
    projectId: string
    project: { name: string }
  }[]
}

const PRIORITY_DOT: Record<string, string> = {
  low: "bg-slate-400",
  medium: "bg-blue-400",
  high: "bg-orange-400",
  urgent: "bg-red-500",
}

const STAGE_BADGE_COLORS: Record<string, string> = {
  inbox: "bg-gray-100 text-gray-700",
  discovery: "bg-violet-100 text-violet-700",
  planning: "bg-indigo-100 text-indigo-700",
  development: "bg-cyan-100 text-cyan-700",
  testing: "bg-teal-100 text-teal-700",
  review: "bg-amber-100 text-amber-700",
  done: "bg-green-100 text-green-700",
  merge: "bg-emerald-100 text-emerald-700",
}

export default function DashboardPage() {
  const { data: session } = useSession()

  const { data: projectsData } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.get<ProjectsResponse>("/api/projects"),
  })

  const { data: dashboardData } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => api.get<DashboardStats>("/api/metrics/dashboard"),
    refetchInterval: 30000,
  })

  const projects = projectsData?.projects ?? []
  const stats = dashboardData?.stats
  const recentDemands = dashboardData?.recentDemands ?? []
  const reviewDemands = recentDemands.filter(
    (d) => d.stage === "review" || d.stage === "merge"
  )

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Dashboard</h2>
          {session?.user && (
            <p className="mt-1 text-sm text-muted-foreground">
              Welcome, {session.user.name}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/projects">
              <FolderOpen className="size-4" />
              Projects
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Demands
            </CardTitle>
            <Activity className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {stats?.activeDemands ?? "-"}
            </div>
          </CardContent>
        </Card>

        <Card className={reviewDemands.length > 0 ? "ring-1 ring-amber-200" : ""}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Awaiting Review
            </CardTitle>
            <ClipboardCheck className="size-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-600">
              {stats?.awaitingReview ?? "-"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Completed This Week
            </CardTitle>
            <TrendingUp className="size-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {stats?.completedThisWeek ?? "-"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Cost
            </CardTitle>
            <DollarSign className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {stats != null ? `$${stats.totalCostUsd.toFixed(2)}` : "-"}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Demands Awaiting Review */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardCheck className="size-4 text-amber-500" />
              Awaiting Human Review
            </CardTitle>
          </CardHeader>
          <CardContent>
            {reviewDemands.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No demands awaiting review
              </p>
            ) : (
              <div className="space-y-2">
                {reviewDemands.map((demand) => (
                  <Link
                    key={demand.id}
                    href={`/demands/${demand.id}`}
                    className="flex items-center gap-3 rounded-md border p-3 hover:bg-muted/50 transition-colors"
                  >
                    <span
                      className={`inline-block size-2 rounded-full shrink-0 ${PRIORITY_DOT[demand.priority] ?? "bg-gray-400"}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {demand.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {demand.project.name}
                      </p>
                    </div>
                    <ArrowRight className="size-4 text-muted-foreground shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="size-4" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentDemands.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No recent activity
              </p>
            ) : (
              <div className="space-y-2">
                {recentDemands.slice(0, 8).map((demand) => (
                  <Link
                    key={demand.id}
                    href={`/demands/${demand.id}`}
                    className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors"
                  >
                    <span
                      className={`inline-block size-2 rounded-full shrink-0 ${PRIORITY_DOT[demand.priority] ?? "bg-gray-400"}`}
                    />
                    <p className="flex-1 min-w-0 text-sm truncate">
                      {demand.title}
                    </p>
                    <Badge
                      className={`text-[10px] shrink-0 ${STAGE_BADGE_COLORS[demand.stage] ?? "bg-gray-100 text-gray-700"}`}
                    >
                      {STAGE_LABELS[demand.stage as PipelineStage] ??
                        demand.stage}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground shrink-0 w-14 text-right">
                      {formatDistanceToNow(new Date(demand.updatedAt), {
                        addSuffix: false,
                      })}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Project Boards */}
      {projects.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Project Boards</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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

      {projects.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-10 gap-3">
            <FolderOpen className="size-10 text-muted-foreground" />
            <p className="text-muted-foreground">No projects yet</p>
            <Button asChild>
              <Link href="/projects/new">
                <Plus className="size-4" />
                Create your first project
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
