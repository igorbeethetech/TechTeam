export type ProjectStatus = "active" | "archived"

export type MergeStrategy = "fifo" | "priority"

export interface Project {
  id: string
  tenantId: string
  name: string
  description: string | null
  repoUrl: string
  repoPath: string
  defaultBranch: string
  techStack: string
  status: ProjectStatus
  maxConcurrentDev: number
  mergeStrategy: MergeStrategy
  createdAt: Date
  updatedAt: Date
}
