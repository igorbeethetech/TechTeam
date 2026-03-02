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
