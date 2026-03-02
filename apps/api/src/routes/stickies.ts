import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify"
import { stickyCreateSchema, stickyUpdateSchema } from "@techteam/shared"
import { publishWsEvent } from "../lib/ws-events.js"

export default async function stickyRoutes(fastify: FastifyInstance) {
  // GET / - List stickies (filtered by reqsProjectId and/or meetingId)
  fastify.get("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const { reqsProjectId, meetingId } = request.query as { reqsProjectId?: string; meetingId?: string }
    const where: Record<string, unknown> = {}
    if (reqsProjectId) where.reqsProjectId = reqsProjectId
    if (meetingId) where.meetingId = meetingId

    const stickies = await request.prisma.sticky.findMany({
      where,
      orderBy: { createdAt: "desc" },
    })
    return { stickies }
  })

  // POST / - Create sticky
  fastify.post("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = stickyCreateSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      })
    }

    const sticky = await request.prisma.sticky.create({
      data: {
        ...parsed.data,
        createdBy: request.session!.user.id,
      } as any,
    })

    await publishWsEvent({
      type: "sticky:created",
      tenantId: sticky.tenantId,
      payload: { stickyId: sticky.id, meetingId: sticky.meetingId, reqsProjectId: sticky.reqsProjectId },
    })

    return reply.status(201).send({ sticky })
  })

  // PATCH /:id - Update sticky
  fastify.patch("/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params
    const parsed = stickyUpdateSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      })
    }

    try {
      const sticky = await request.prisma.sticky.update({
        where: { id },
        data: parsed.data as any,
      })

      await publishWsEvent({
        type: "sticky:updated",
        tenantId: sticky.tenantId,
        payload: { stickyId: sticky.id, meetingId: sticky.meetingId, reqsProjectId: sticky.reqsProjectId },
      })

      return { sticky }
    } catch (error: unknown) {
      if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "P2025") {
        return reply.status(404).send({ error: "Sticky not found" })
      }
      throw error
    }
  })

  // DELETE /:id - Delete sticky
  fastify.delete("/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params
    try {
      const sticky = await request.prisma.sticky.delete({
        where: { id },
      })

      await publishWsEvent({
        type: "sticky:deleted",
        tenantId: sticky.tenantId,
        payload: { stickyId: sticky.id, meetingId: sticky.meetingId, reqsProjectId: sticky.reqsProjectId },
      })

      return reply.status(204).send()
    } catch (error: unknown) {
      if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "P2025") {
        return reply.status(404).send({ error: "Sticky not found" })
      }
      throw error
    }
  })
}
