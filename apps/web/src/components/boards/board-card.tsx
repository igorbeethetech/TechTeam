"use client"

import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PIPELINE_STAGES, STAGE_LABELS, type PipelineStage } from "@techteam/shared"

interface BoardCardProps {
  project: {
    id: string
    name: string
    demandCounts: Partial<Record<PipelineStage, number>>
  }
}

export function BoardCard({ project }: BoardCardProps) {
  const totalDemands = Object.values(project.demandCounts).reduce((sum, c) => sum + (c ?? 0), 0)

  return (
    <Link href={`/projects/${project.id}/board`}>
      <Card className="hover:border-primary/50 hover:shadow-md transition-all cursor-pointer h-full">
        <CardHeader>
          <CardTitle className="text-base">{project.name}</CardTitle>
        </CardHeader>
        <CardContent>
          {totalDemands === 0 ? (
            <p className="text-sm text-muted-foreground">No demands yet</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {PIPELINE_STAGES.filter((stage) => (project.demandCounts[stage] ?? 0) > 0).map((stage) => (
                <Badge key={stage} variant="secondary" className="text-xs">
                  {project.demandCounts[stage]} {STAGE_LABELS[stage]}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
