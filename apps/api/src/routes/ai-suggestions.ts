import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify"
import { z } from "zod"
import { publishWsEvent } from "../lib/ws-events.js"

const suggestionStatusSchema = z.object({
  status: z.enum(["pending", "asked", "deferred", "dismissed"]),
})

export default async function aiSuggestionRoutes(fastify: FastifyInstance) {
  // GET / - List AI suggestions (filtered by meetingId)
  fastify.get("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const { meetingId } = request.query as { meetingId?: string }
    if (!meetingId) {
      return reply.status(400).send({ error: "meetingId query parameter is required" })
    }
    const suggestions = await request.prisma.aISuggestion.findMany({
      where: { meetingId },
      orderBy: { createdAt: "desc" },
    })
    return { suggestions }
  })

  // PATCH /:id - Update suggestion status
  fastify.patch("/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params
    const parsed = suggestionStatusSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      })
    }

    try {
      const data: Record<string, unknown> = { status: parsed.data.status }
      if (parsed.data.status !== "pending") {
        data.resolvedAt = new Date()
      }

      const suggestion = await request.prisma.aISuggestion.update({
        where: { id },
        data: data as any,
      })

      await publishWsEvent({
        type: "suggestion:updated",
        tenantId: suggestion.tenantId,
        payload: { suggestionId: suggestion.id, meetingId: suggestion.meetingId },
      })

      return { suggestion }
    } catch (error: unknown) {
      if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "P2025") {
        return reply.status(404).send({ error: "Suggestion not found" })
      }
      throw error
    }
  })
}
