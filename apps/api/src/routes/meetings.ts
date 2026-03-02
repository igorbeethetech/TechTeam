import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify"
import { meetingCreateSchema, meetingUpdateSchema } from "@techteam/shared"
import { publishWsEvent } from "../lib/ws-events.js"

export default async function meetingRoutes(fastify: FastifyInstance) {
  // GET / - List meetings (filtered by reqsProjectId)
  fastify.get("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const { reqsProjectId } = request.query as { reqsProjectId?: string }
    if (!reqsProjectId) {
      return reply.status(400).send({ error: "reqsProjectId query parameter is required" })
    }
    const meetings = await request.prisma.meeting.findMany({
      where: { reqsProjectId },
      orderBy: { meetingNumber: "asc" },
    })
    return { meetings }
  })

  // POST / - Create meeting (auto-increment meetingNumber)
  fastify.post("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = meetingCreateSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      })
    }

    // Auto-increment meeting number within the project
    const lastMeeting = await request.prisma.meeting.findFirst({
      where: { reqsProjectId: parsed.data.reqsProjectId },
      orderBy: { meetingNumber: "desc" },
      select: { meetingNumber: true },
    })
    const meetingNumber = (lastMeeting?.meetingNumber ?? 0) + 1

    const meeting = await request.prisma.meeting.create({
      data: {
        ...parsed.data,
        meetingNumber,
        scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : undefined,
        createdBy: request.session!.user.id,
      } as any,
    })
    return reply.status(201).send({ meeting })
  })

  // GET /:id - Get single meeting
  fastify.get("/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params
    const meeting = await request.prisma.meeting.findUnique({
      where: { id },
      include: {
        reqsProject: {
          select: { id: true, name: true, clientId: true, client: { select: { id: true, name: true, sector: true } } },
        },
        _count: { select: { stickies: true, aiSuggestions: true, transcriptChunks: true } },
      },
    })
    if (!meeting) {
      return reply.status(404).send({ error: "Meeting not found" })
    }
    return { meeting }
  })

  // PATCH /:id - Update meeting
  fastify.patch("/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params
    const parsed = meetingUpdateSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      })
    }

    try {
      const data: Record<string, unknown> = { ...parsed.data }
      if (parsed.data.startedAt) data.startedAt = new Date(parsed.data.startedAt)
      if (parsed.data.endedAt) data.endedAt = new Date(parsed.data.endedAt)

      const meeting = await request.prisma.meeting.update({
        where: { id },
        data: data as any,
      })

      await publishWsEvent({
        type: "meeting:updated",
        tenantId: meeting.tenantId,
        payload: { meetingId: meeting.id, reqsProjectId: meeting.reqsProjectId },
      })

      return { meeting }
    } catch (error: unknown) {
      if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "P2025") {
        return reply.status(404).send({ error: "Meeting not found" })
      }
      throw error
    }
  })

  // GET /:id/transcript - Get transcript chunks for a meeting
  fastify.get("/:id/transcript", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params
    const chunks = await request.prisma.transcriptChunk.findMany({
      where: { meetingId: id },
      orderBy: { chunkIndex: "asc" },
    })
    return { chunks }
  })
}
