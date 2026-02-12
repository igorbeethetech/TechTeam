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
  rejectionCount: number
  testingFeedback: unknown
  mergeStatus: string | null
  mergeConflicts: unknown
  mergeAttempts: number
  totalTokens: number
  totalCostUsd: number
  agentStatus: string | null
  createdBy: string
  createdAt: Date
  updatedAt: Date
  agentRuns?: AgentRun[]
}

export type AgentStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "timeout"
  | "paused"

export interface AgentRun {
  id: string
  tenantId: string
  demandId: string
  phase: DemandStage
  status: AgentStatus
  tokensIn: number
  tokensOut: number
  costUsd: number
  durationMs: number
  output: unknown
  error: string | null
  attempt: number
  createdAt: Date
  updatedAt: Date
}
