import { Worker, type Job } from "bullmq"
import { createWorkerConnection } from "../lib/redis.js"
import { forTenant } from "@techteam/database"
import type { AgentJobData, AgentJobResult } from "./agent.queue.js"

// Timeout per phase (AGENT-07 requirement)
const PHASE_TIMEOUTS: Record<string, number> = {
  discovery: 2 * 60 * 1000, // 2 minutes
  planning: 5 * 60 * 1000, // 5 minutes
}

/**
 * Creates and returns the BullMQ worker for the agent pipeline.
 * The worker processes agent jobs with tenant isolation, retry handling,
 * and automatic stage advancement.
 */
export function createAgentWorker() {
  const worker = new Worker<AgentJobData, AgentJobResult>(
    "agent-pipeline",
    async (job: Job<AgentJobData>) => {
      const { demandId, tenantId, projectId, phase } = job.data
      const attempt = job.attemptsMade + 1

      console.log(
        `[agent-worker] Processing job ${job.id}: phase=${phase}, demandId=${demandId}, attempt=${attempt}`
      )

      const prisma = forTenant(tenantId)

      // Create AgentRun record with status 'running'
      const agentRun = await prisma.agentRun.create({
        data: {
          demandId,
          phase,
          status: "running",
          attempt,
        } as any,
      })

      try {
        // Dynamically import the correct agent function based on phase
        // Lazy import avoids circular dependencies
        let agentResult: { output: unknown; hasAmbiguities?: boolean }

        if (phase === "discovery") {
          const { runDiscoveryAgent } = await import(
            "../agents/discovery.agent.js"
          )
          agentResult = await runDiscoveryAgent({
            demandId,
            tenantId,
            projectId,
            timeout: PHASE_TIMEOUTS[phase]!,
          })
        } else if (phase === "planning") {
          const { runPlanningAgent } = await import(
            "../agents/planning.agent.js"
          )
          agentResult = await runPlanningAgent({
            demandId,
            tenantId,
            projectId,
            timeout: PHASE_TIMEOUTS[phase]!,
          })
        } else {
          throw new Error(`Unknown phase: ${phase}`)
        }

        // Update AgentRun to completed
        await prisma.agentRun.update({
          where: { id: agentRun.id },
          data: {
            status: "completed",
            output: agentResult.output as any,
          },
        })

        // Update demand agentStatus based on result
        await prisma.demand.update({
          where: { id: demandId },
          data: { agentStatus: null },
        })

        // Handle stage advancement
        if (phase === "discovery") {
          if (agentResult.hasAmbiguities) {
            // Keep in discovery, set paused
            await prisma.demand.update({
              where: { id: demandId },
              data: { agentStatus: "paused" },
            })
          } else {
            // Advance to planning and enqueue planning job
            await prisma.demand.update({
              where: { id: demandId },
              data: { stage: "planning", agentStatus: "queued" },
            })
            const { agentQueue } = await import("./agent.queue.js")
            await agentQueue.add("run-agent", {
              demandId,
              tenantId,
              projectId,
              phase: "planning",
            })
          }
        } else if (phase === "planning") {
          // Advance to development (parked for Phase 4)
          await prisma.demand.update({
            where: { id: demandId },
            data: { stage: "development", agentStatus: null },
          })
        }

        console.log(
          `[agent-worker] Job ${job.id} completed: phase=${phase}, demandId=${demandId}`
        )

        return agentResult as AgentJobResult
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error)
        const isTimeout = errorMessage.includes("timed out")

        // Update AgentRun to failed/timeout
        await prisma.agentRun.update({
          where: { id: agentRun.id },
          data: {
            status: isTimeout ? "timeout" : "failed",
            error: errorMessage,
          },
        })

        // Set demand agentStatus to failed
        await prisma.demand.update({
          where: { id: demandId },
          data: { agentStatus: "failed" },
        })

        console.error(
          `[agent-worker] Job ${job.id} failed: ${errorMessage}`
        )

        // Re-throw so BullMQ handles retry
        throw error
      }
    },
    {
      connection: createWorkerConnection(),
      concurrency: 2,
    }
  )

  // CRITICAL: Always attach error handler per BullMQ docs
  worker.on("error", (err) => {
    console.error("[agent-worker] Worker error:", err)
  })

  return worker
}
