import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify"
import { Prisma } from "@techteam/database"
import { mergeQueue } from "../queues/merge.queue.js"

/**
 * Merge API routes.
 * Provides retry endpoint for human-resolved conflicts and merge status query
 * for the dashboard to display conflict context.
 */
export default async function mergeRoutes(fastify: FastifyInstance) {
  // POST /demands/:id/merge/retry -- Re-enqueue merge job after human resolution
  fastify.post(
    "/demands/:id/merge/retry",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params

      const demand = await request.prisma.demand.findUnique({
        where: { id },
      })

      if (!demand) {
        return reply.status(404).send({ error: "Demand not found" })
      }

      if (demand.mergeStatus !== "needs_human") {
        return reply.status(400).send({
          error: "Demand is not waiting for human merge resolution",
        })
      }

      if (demand.stage !== "merge") {
        return reply.status(400).send({
          error: "Demand is not in merge stage",
        })
      }

      try {
        // Reset merge state and re-enqueue
        await request.prisma.demand.update({
          where: { id },
          data: {
            mergeStatus: "pending",
            agentStatus: "queued",
            mergeConflicts: Prisma.DbNull,
          },
        })

        await mergeQueue.add("merge-demand", {
          demandId: id,
          tenantId: request.session!.session.activeOrganizationId!,
          projectId: demand.projectId,
        })

        return { success: true, message: "Merge job re-enqueued" }
      } catch (error: unknown) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          (error as { code: string }).code === "P2025"
        ) {
          return reply.status(404).send({ error: "Demand not found" })
        }
        throw error
      }
    }
  )

  // GET /demands/:id/merge/status -- Get merge status with conflict details
  fastify.get(
    "/demands/:id/merge/status",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params

      const demand = await request.prisma.demand.findUnique({
        where: { id },
        select: {
          id: true,
          mergeStatus: true,
          mergeConflicts: true,
          mergeAttempts: true,
          prUrl: true,
          branchName: true,
          stage: true,
        },
      })

      if (!demand) {
        return reply.status(404).send({ error: "Demand not found" })
      }

      return {
        mergeStatus: demand.mergeStatus,
        mergeConflicts: demand.mergeConflicts,
        mergeAttempts: demand.mergeAttempts,
        prUrl: demand.prUrl,
        branchName: demand.branchName,
        canRetry:
          demand.mergeStatus === "needs_human" && demand.stage === "merge",
      }
    }
  )
}
