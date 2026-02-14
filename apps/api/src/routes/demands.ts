import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify"
import { demandCreateSchema, demandStageUpdateSchema } from "@techteam/shared"
import { agentQueue } from "../queues/agent.queue.js"

export default async function demandRoutes(fastify: FastifyInstance) {
  // GET / - List demands, optionally filtered by projectId
  fastify.get("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const { projectId } = request.query as { projectId?: string }
    const where = projectId ? { projectId } : {}
    const demands = await request.prisma.demand.findMany({
      where,
      orderBy: { createdAt: "asc" },
    })
    return { demands }
  })

  // POST / - Create a new demand
  fastify.post("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = demandCreateSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      })
    }

    const demand = await request.prisma.demand.create({
      data: {
        ...parsed.data,
        createdBy: request.session!.user.id,
      } as any,
    })
    return reply.status(201).send({ demand })
  })

  // GET /:id - Get a single demand
  fastify.get("/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params
    const demand = await request.prisma.demand.findUnique({
      where: { id },
    })
    if (!demand) {
      return reply.status(404).send({ error: "Demand not found" })
    }
    return { demand }
  })

  // POST /:id/clarify - Submit clarification answers for paused demand
  fastify.post("/:id/clarify", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params
    const { answers } = request.body as { answers: { question: string; answer: string }[] }

    if (!answers || !Array.isArray(answers) || answers.length === 0) {
      return reply.status(400).send({ error: "answers array is required" })
    }

    // Verify demand exists and is paused
    const demand = await request.prisma.demand.findUnique({ where: { id } })
    if (!demand) {
      return reply.status(404).send({ error: "Demand not found" })
    }
    if (demand.agentStatus !== "paused") {
      return reply.status(400).send({ error: "Demand is not paused" })
    }

    // Append clarifications to existing requirements
    const requirements = demand.requirements as Record<string, unknown> | null
    const updatedRequirements = {
      ...requirements,
      clarifications: answers,
    }

    // Update demand: store clarifications, re-queue discovery
    await request.prisma.demand.update({
      where: { id },
      data: {
        requirements: updatedRequirements as any,
        agentStatus: "queued",
      },
    })

    // Re-enqueue discovery job with clarifications
    await agentQueue.add("run-agent", {
      demandId: id,
      tenantId: request.session!.session.activeOrganizationId!,
      projectId: demand.projectId,
      phase: "discovery",
    })

    return { success: true }
  })

  // PATCH /:id/stage - Update demand stage (drag-and-drop)
  fastify.patch("/:id/stage", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params
    const parsed = demandStageUpdateSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      })
    }

    try {
      const demand = await request.prisma.demand.update({
        where: { id },
        data: { stage: parsed.data.stage },
      })

      // When stage changes to discovery, enqueue agent job
      if (parsed.data.stage === "discovery") {
        await agentQueue.add("run-agent", {
          demandId: id,
          tenantId: request.session!.session.activeOrganizationId!,
          projectId: demand.projectId,
          phase: "discovery",
        })
        await request.prisma.demand.update({
          where: { id },
          data: { agentStatus: "queued" },
        })
      }

      // When stage changes to development, enqueue development agent job
      if (parsed.data.stage === "development") {
        await agentQueue.add("run-agent", {
          demandId: id,
          tenantId: request.session!.session.activeOrganizationId!,
          projectId: demand.projectId,
          phase: "development",
        })
        await request.prisma.demand.update({
          where: { id },
          data: { agentStatus: "queued" },
        })
      }

      // When stage changes to merge, enqueue merge job
      if (parsed.data.stage === "merge") {
        const { mergeQueue } = await import("../queues/merge.queue.js")
        await mergeQueue.add("merge-demand", {
          demandId: id,
          tenantId: request.session!.session.activeOrganizationId!,
          projectId: demand.projectId,
        })
        await request.prisma.demand.update({
          where: { id },
          data: { agentStatus: "queued" },
        })
      }

      return { demand }
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
  })
}
