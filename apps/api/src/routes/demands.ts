import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify"
import { demandCreateSchema, demandStageUpdateSchema } from "@techteam/shared"
import { agentQueue } from "../queues/agent.queue.js"
import { publishWsEvent } from "../lib/ws-events.js"
import { validatePreflight } from "../lib/preflight.js"

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

  // GET /:id - Get a single demand (includes project for test links)
  fastify.get("/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params
    const demand = await request.prisma.demand.findUnique({
      where: { id },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            repoUrl: true,
            defaultBranch: true,
            testInstructions: true,
            previewUrlTemplate: true,
          },
        },
      },
    })
    if (!demand) {
      return reply.status(404).send({ error: "Demand not found" })
    }
    return { demand }
  })

  // POST /:id/start - Start the agent pipeline (move from inbox to discovery)
  fastify.post("/:id/start", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params

    const demand = await request.prisma.demand.findUnique({ where: { id } })
    if (!demand) {
      return reply.status(404).send({ error: "Demand not found" })
    }
    if (demand.stage !== "inbox") {
      return reply.status(400).send({ error: "Demand already started" })
    }

    // Pre-flight validation
    const tenantId = request.session!.session.activeOrganizationId!
    const preflight = await validatePreflight(tenantId)
    if (!preflight.ok) {
      return reply.status(400).send({
        error: preflight.errors[0]?.message ?? "Configuração incompleta",
        details: preflight.errors,
      })
    }

    await request.prisma.demand.update({
      where: { id },
      data: { stage: "discovery", agentStatus: "queued" },
    })

    await agentQueue.add("run-agent", {
      demandId: id,
      tenantId: request.session!.session.activeOrganizationId!,
      projectId: demand.projectId,
      phase: "discovery",
    })

    return { success: true }
  })

  // POST /:id/review - Approve or reject a demand after human review
  fastify.post("/:id/review", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params
    const { action, feedback } = request.body as {
      action: "approve" | "reject"
      feedback?: string
    }

    if (!action || !["approve", "reject"].includes(action)) {
      return reply.status(400).send({ error: "action must be 'approve' or 'reject'" })
    }

    const demand = await request.prisma.demand.findUnique({ where: { id } })
    if (!demand) {
      return reply.status(404).send({ error: "Demand not found" })
    }

    if (demand.stage !== "review") {
      return reply.status(400).send({ error: "Demand is not in review stage" })
    }

    const tenantId = request.session!.session.activeOrganizationId!

    if (action === "approve") {
      await request.prisma.demand.update({
        where: { id },
        data: {
          stage: "done",
          agentStatus: null,
          completedAt: new Date(),
        } as any,
      })

      try {
        await publishWsEvent({ type: "demand:stage-changed", tenantId, payload: { demandId: id, projectId: demand.projectId } })
      } catch {}

      try {
        await (request.prisma as any).notification.create({
          data: {
            type: "demand_done",
            title: "Demand completed",
            message: `"${demand.title}" has been approved and marked as done.`,
            demandId: id,
            projectId: demand.projectId,
          },
        })
        await publishWsEvent({ type: "notification:created", tenantId, payload: { demandId: id } })
      } catch {}

      return { success: true, message: "Demand approved and completed" }
    } else {
      // Reject: send back to development with feedback
      if (!feedback) {
        return reply.status(400).send({ error: "feedback is required when rejecting" })
      }

      const newRejectionCount = ((demand.rejectionCount as number) ?? 0) + 1

      await request.prisma.demand.update({
        where: { id },
        data: {
          stage: "development",
          agentStatus: "queued",
          rejectionCount: newRejectionCount,
          testingFeedback: { humanReviewFeedback: feedback } as any,
        },
      })

      try {
        await publishWsEvent({ type: "demand:stage-changed", tenantId, payload: { demandId: id, projectId: demand.projectId } })
      } catch {}

      // Re-enqueue development job with feedback
      await agentQueue.add("run-agent", {
        demandId: id,
        tenantId,
        projectId: demand.projectId,
        phase: "development",
      })

      try {
        await (request.prisma as any).notification.create({
          data: {
            type: "demand_rejected",
            title: "Demand rejected",
            message: `"${demand.title}" was rejected during review: ${feedback.slice(0, 200)}`,
            demandId: id,
            projectId: demand.projectId,
          },
        })
        await publishWsEvent({ type: "notification:created", tenantId, payload: { demandId: id } })
      } catch {}

      return { success: true, message: "Demand rejected, returning to development" }
    }
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

    // Pre-flight check when moving to agent-driven stages
    if (parsed.data.stage === "discovery" || parsed.data.stage === "development") {
      const tenantId = request.session!.session.activeOrganizationId!
      const preflight = await validatePreflight(tenantId)
      if (!preflight.ok) {
        return reply.status(400).send({
          error: preflight.errors[0]?.message ?? "Configuração incompleta",
          details: preflight.errors,
        })
      }
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

      // Review stage: no auto-merge, just mark as ready for human review

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
