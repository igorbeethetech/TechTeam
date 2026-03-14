import { Queue } from "bullmq"
import { createQueueConnection } from "../lib/redis.js"

export interface AgentJobData {
  demandId: string
  tenantId: string
  projectId: string
  phase: "discovery" | "planning" | "development" | "testing"
}

export interface AgentJobResult {
  output: unknown
  hasAmbiguities?: boolean
}

export const agentQueue = new Queue<AgentJobData, AgentJobResult>(
  "agent-pipeline",
  {
    connection: createQueueConnection(),
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  }
)

/** Generate a deterministic job ID for tracking and cancellation. */
export function makeAgentJobId(demandId: string, phase: string): string {
  return `agent-${demandId}-${phase}-${Date.now()}`
}
