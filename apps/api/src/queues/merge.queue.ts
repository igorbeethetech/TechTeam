import { Queue } from "bullmq"
import { createQueueConnection } from "../lib/redis.js"

export interface MergeJobData {
  demandId: string
  tenantId: string
  projectId: string
}

export interface MergeJobResult {
  merged: boolean
  mergeStatus: string
  error?: string
}

export const mergeQueue = new Queue<MergeJobData, MergeJobResult>(
  "merge-queue",
  {
    connection: createQueueConnection(),
    defaultJobOptions: {
      attempts: 2,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  }
)
