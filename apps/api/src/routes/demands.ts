import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify"
import { demandCreateSchema, demandStageUpdateSchema } from "@techteam/shared"
import { agentQueue, makeAgentJobId } from "../queues/agent.queue.js"
import { publishWsEvent } from "../lib/ws-events.js"
import { validatePreflight } from "../lib/preflight.js"
import { requestCancelViaRedis } from "../lib/process-registry.js"
import { cleanupDemandResources } from "../lib/cleanup.js"
import { createQueueConnection } from "../lib/redis.js"
import { getTenantLanguage } from "../lib/i18n.js"
import { getNotificationText } from "../lib/notification-templates.js"

export default async function demandRoutes(fastify: FastifyInstance) {
  // GET / - List demands, optionally filtered by projectId
  fastify.get("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const { projectId, includeCancelled } = request.query as { projectId?: string; includeCancelled?: string }
    const where: Record<string, unknown> = {}
    if (projectId) where.projectId = projectId
    if (includeCancelled !== "true") where.cancelledAt = null
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
    if (demand.cancelledAt) {
      return reply.status(400).send({ error: "Cannot start a cancelled demand" })
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

    if (demand.cancelledAt) {
      return reply.status(400).send({ error: "Cannot review a cancelled demand" })
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
        const lang = await getTenantLanguage(tenantId)
        const notif = getNotificationText("demand_done", lang, { title: demand.title })
        await (request.prisma as any).notification.create({
          data: {
            type: "demand_done",
            title: notif.title,
            message: notif.message,
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
        const lang = await getTenantLanguage(tenantId)
        const notif = getNotificationText("demand_rejected", lang, { title: demand.title, feedback: feedback.slice(0, 200) })
        await (request.prisma as any).notification.create({
          data: {
            type: "demand_rejected",
            title: notif.title,
            message: notif.message,
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
    if (demand.cancelledAt) {
      return reply.status(400).send({ error: "Cannot clarify a cancelled demand" })
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

    // Guard: cannot change stage of cancelled demand
    const demandForStage = await request.prisma.demand.findUnique({ where: { id } })
    if (demandForStage?.cancelledAt) {
      return reply.status(400).send({ error: "Cannot update stage of a cancelled demand" })
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

  // POST /:id/cancel-agent - Cancel a running or queued agent
  fastify.post("/:id/cancel-agent", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params
    const tenantId = request.session!.session.activeOrganizationId!

    const demand = await request.prisma.demand.findUnique({ where: { id } })
    if (!demand) {
      return reply.status(404).send({ error: "Demand not found" })
    }

    if (demand.cancelledAt) {
      return reply.status(400).send({ error: "Demand is already cancelled" })
    }
    if (!demand.agentStatus || !["queued", "running"].includes(demand.agentStatus)) {
      return reply.status(400).send({ error: "No active agent to cancel" })
    }

    // Find last running/queued AgentRun
    const lastRun = await request.prisma.agentRun.findFirst({
      where: {
        demandId: id,
        status: { in: ["running", "queued"] },
      },
      orderBy: { createdAt: "desc" },
    })

    if (demand.agentStatus === "running") {
      // Signal worker to cancel the process via Redis pub/sub
      const redis = createQueueConnection()
      try {
        await requestCancelViaRedis(redis, id)
        // Wait up to 5s for process to die
        await new Promise((resolve) => setTimeout(resolve, 3000))
      } finally {
        await redis.quit()
      }
    }

    // If queued with a jobId, try to remove the job from the queue
    if (demand.agentStatus === "queued" && lastRun?.jobId) {
      try {
        const job = await agentQueue.getJob(lastRun.jobId)
        if (job) {
          await job.remove()
        }
      } catch (err) {
        console.warn(`[cancel-agent] Failed to remove queued job:`, err)
      }
    }

    // Update AgentRun if it's still in a non-terminal state
    if (lastRun) {
      try {
        await request.prisma.agentRun.update({
          where: { id: lastRun.id },
          data: { status: "cancelled", error: "Cancelled by user" },
        })
      } catch {
        // May have already been updated by the worker
      }
    }

    // Update demand status
    await request.prisma.demand.update({
      where: { id },
      data: { agentStatus: "cancelled" },
    })

    // Release dev slot if in development
    if (demand.stage === "development") {
      const { releaseDevSlot } = await import("../lib/concurrency.js")
      const redis = createQueueConnection()
      try {
        await releaseDevSlot(redis, demand.projectId, id)
      } finally {
        await redis.quit()
      }
    }

    try {
      await publishWsEvent({ type: "agent:status-changed", tenantId, payload: { demandId: id, projectId: demand.projectId } })
      await publishWsEvent({ type: "agent-run:updated", tenantId, payload: { demandId: id } })
    } catch {}

    return { success: true, message: "Agent cancelled" }
  })

  // POST /:id/retry - Retry a failed/timeout/cancelled phase
  fastify.post("/:id/retry", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params
    const tenantId = request.session!.session.activeOrganizationId!

    const demand = await request.prisma.demand.findUnique({ where: { id } })
    if (!demand) {
      return reply.status(404).send({ error: "Demand not found" })
    }

    if (demand.cancelledAt) {
      return reply.status(400).send({ error: "Cannot retry a cancelled demand" })
    }
    if (!demand.agentStatus || !["failed", "timeout", "cancelled"].includes(demand.agentStatus)) {
      return reply.status(400).send({ error: "Demand is not in a retriable state" })
    }

    // Map current stage to agent phase
    const stageToPhase: Record<string, string> = {
      discovery: "discovery",
      planning: "planning",
      development: "development",
      testing: "testing",
    }
    const phase = stageToPhase[demand.stage]
    if (!phase) {
      return reply.status(400).send({ error: `Cannot retry from stage: ${demand.stage}` })
    }

    // Pre-flight validation
    const preflight = await validatePreflight(tenantId)
    if (!preflight.ok) {
      return reply.status(400).send({
        error: preflight.errors[0]?.message ?? "Configuração incompleta",
        details: preflight.errors,
      })
    }

    // Set agentStatus to queued and enqueue job
    await request.prisma.demand.update({
      where: { id },
      data: { agentStatus: "queued" },
    })

    const jobId = makeAgentJobId(id, phase)
    await agentQueue.add("run-agent", {
      demandId: id,
      tenantId,
      projectId: demand.projectId,
      phase: phase as "discovery" | "planning" | "development" | "testing",
    }, { jobId })

    try {
      await publishWsEvent({ type: "agent:status-changed", tenantId, payload: { demandId: id, projectId: demand.projectId } })
    } catch {}

    return { success: true, message: `Retrying ${phase} phase` }
  })

  // POST /:id/cancel - Cancel demand entirely (close PR, clean up, return to inbox)
  fastify.post("/:id/cancel", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params
    const { closePr = true, deleteBranch = false } = (request.body ?? {}) as {
      closePr?: boolean
      deleteBranch?: boolean
    }
    const tenantId = request.session!.session.activeOrganizationId!

    const demand = await request.prisma.demand.findUnique({
      where: { id },
      include: {
        project: {
          select: { id: true, repoUrl: true, maxConcurrentDev: true },
        },
      },
    })
    if (!demand) {
      return reply.status(404).send({ error: "Demand not found" })
    }

    if (demand.cancelledAt) {
      return reply.status(400).send({ error: "Demand is already cancelled" })
    }
    if (demand.stage === "inbox") {
      return reply.status(400).send({ error: "Demand is still in inbox" })
    }

    // 1. If agent is active, cancel it first
    if (demand.agentStatus && ["queued", "running"].includes(demand.agentStatus)) {
      // Find last active AgentRun
      const lastRun = await request.prisma.agentRun.findFirst({
        where: { demandId: id, status: { in: ["running", "queued"] } },
        orderBy: { createdAt: "desc" },
      })

      if (demand.agentStatus === "running") {
        const redis = createQueueConnection()
        try {
          await requestCancelViaRedis(redis, id)
          await new Promise((resolve) => setTimeout(resolve, 3000))
        } finally {
          await redis.quit()
        }
      }

      if (lastRun?.jobId && demand.agentStatus === "queued") {
        try {
          const job = await agentQueue.getJob(lastRun.jobId)
          if (job) await job.remove()
        } catch {}
      }

      if (lastRun) {
        try {
          await request.prisma.agentRun.update({
            where: { id: lastRun.id },
            data: { status: "cancelled", error: "Demand cancelled by user" },
          })
        } catch {}
      }
    }

    // 2. Cleanup resources (PR, branch, dev slot)
    await cleanupDemandResources({
      demand: { ...demand, project: demand.project },
      tenantId,
      closePr,
      deleteBranch,
    })

    // 3. Soft delete: mark as cancelled, preserve all data
    await request.prisma.demand.update({
      where: { id },
      data: {
        cancelledAt: new Date(),
        agentStatus: null,
      },
    })

    // 4. Create notification
    try {
      const lang = await getTenantLanguage(tenantId)
      const notif = getNotificationText("demand_cancelled", lang, { title: demand.title })
      await (request.prisma as any).notification.create({
        data: {
          type: "demand_cancelled",
          title: notif.title,
          message: notif.message,
          demandId: id,
          projectId: demand.projectId,
        },
      })
    } catch {}

    // 5. Emit events
    try {
      await publishWsEvent({ type: "demand:cancelled", tenantId, payload: { demandId: id, projectId: demand.projectId } })
      await publishWsEvent({ type: "demand:stage-changed", tenantId, payload: { demandId: id, projectId: demand.projectId } })
      await publishWsEvent({ type: "notification:created", tenantId, payload: { demandId: id } })
    } catch {}

    return { success: true, message: "Demand cancelled" }
  })
}
