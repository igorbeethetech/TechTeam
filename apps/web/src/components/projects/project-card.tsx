"use client"

import Link from "next/link"
import { ExternalLink, Pencil, Archive, ArchiveRestore, GitBranch, Users, Kanban } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { Project } from "@techteam/shared"

interface ProjectCardProps {
  project: Project
  onArchive: (id: string) => void
  onUnarchive: (id: string) => void
}

export function ProjectCard({ project, onArchive, onUnarchive }: ProjectCardProps) {
  const isArchived = project.status === "archived"

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg">{project.name}</CardTitle>
          <Badge
            variant={isArchived ? "secondary" : "default"}
            className={isArchived ? "" : "bg-green-600 hover:bg-green-700"}
          >
            {project.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {project.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {project.description}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{project.techStack}</Badge>
        </div>

        <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          {project.repoUrl && (
            <a
              href={project.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <ExternalLink className="size-3" />
              <span className="truncate">{project.repoUrl}</span>
            </a>
          )}
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <Users className="size-3" />
              Max {project.maxConcurrentDev} dev{project.maxConcurrentDev > 1 ? "s" : ""}
            </span>
            <span className="inline-flex items-center gap-1">
              <GitBranch className="size-3" />
              {project.mergeStrategy.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="mt-auto flex items-center gap-2 pt-2">
          {!isArchived && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/projects/${project.id}/board`}>
                <Kanban className="size-3.5" />
                Board
              </Link>
            </Button>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link href={`/projects/${project.id}/edit`}>
              <Pencil className="size-3.5" />
              Edit
            </Link>
          </Button>
          {isArchived ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onUnarchive(project.id)}
            >
              <ArchiveRestore className="size-3.5" />
              Unarchive
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onArchive(project.id)}
            >
              <Archive className="size-3.5" />
              Archive
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
