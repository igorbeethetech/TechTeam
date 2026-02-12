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

export type DemandStage = "inbox" | "discovery" | "planning" | "development" | "testing" | "merge" | "done"

export type DemandPriority = "low" | "medium" | "high" | "urgent"

export interface Demand {
  id: string
  tenantId: string
  projectId: string
  title: string
  description: string | null
  stage: DemandStage
  priority: DemandPriority
  complexity: string | null
  requirements: unknown
  plan: unknown
  branchName: string | null
  prUrl: string | null
  mergeStatus: string | null
  mergeConflicts: unknown
  mergeAttempts: number
  totalTokens: number
  totalCostUsd: number
  createdBy: string
  createdAt: Date
  updatedAt: Date
}
