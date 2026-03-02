import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify"
import { createAnthropic } from "@ai-sdk/anthropic"
import { generateObject } from "ai"
import { analyzeChunkRequestSchema, chunkAnalysisSchema } from "@techteam/shared"
import { getBeeSettings } from "../lib/ai/bee-client.js"
import { buildAnalyzeChunkPrompt } from "../lib/ai/prompts/analyze-transcript.js"
import { publishWsEvent } from "../lib/ws-events.js"

export default async function beeAiRoutes(fastify: FastifyInstance) {
  // POST /analyze-chunk - Analyze a transcript chunk with AI
  fastify.post("/analyze-chunk", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = analyzeChunkRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      })
    }

    const { meetingId, chunk, chunkIndex, timestampStart, timestampEnd } = parsed.data
    const tenantId = request.session!.session.activeOrganizationId!

    // 1. Fetch meeting with project and client
    const meeting = await request.prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { id: true, reqsProjectId: true, summary: true },
    })
    if (!meeting) {
      return reply.status(404).send({ error: "Meeting not found" })
    }

    const reqsProject = await request.prisma.reqsProject.findUnique({
      where: { id: meeting.reqsProjectId },
      select: { id: true, name: true, projectType: true, description: true, clientId: true },
    })
    if (!reqsProject) {
      return reply.status(404).send({ error: "Requirements project not found" })
    }

    const client = await request.prisma.client.findUnique({
      where: { id: reqsProject.clientId },
      select: { id: true, name: true, sector: true },
    })
    if (!client) {
      return reply.status(404).send({ error: "Client not found" })
    }

    // 2. Fetch existing stickies, suggestions, and transcript chunks
    const [stickies, suggestions, chunks] = await Promise.all([
      request.prisma.sticky.findMany({
        where: { meetingId },
        select: { category: true, text: true },
      }),
      request.prisma.aISuggestion.findMany({
        where: { meetingId },
        select: { text: true, status: true },
      }),
      request.prisma.transcriptChunk.findMany({
        where: { meetingId },
        orderBy: { chunkIndex: "asc" },
        select: { text: true },
      }),
    ])

    // 3. Save transcript chunk
    const transcriptChunk = await request.prisma.transcriptChunk.create({
      data: {
        meetingId,
        chunkIndex,
        text: chunk,
        timestampStart: timestampStart ?? null,
        timestampEnd: timestampEnd ?? null,
      } as any,
    })

    await publishWsEvent({
      type: "transcript:chunk",
      tenantId,
      payload: { chunkId: transcriptChunk.id, meetingId },
    })

    // 4. Build full transcript so far
    const transcriptSoFar = chunks.map((c) => c.text).join(" ")

    // 5. Get AI settings and call Claude
    const beeSettings = await getBeeSettings(tenantId)
    const anthropic = createAnthropic({ apiKey: beeSettings.anthropicApiKey })

    const prompt = buildAnalyzeChunkPrompt({
      clientName: client.name,
      clientSector: client.sector,
      projectType: reqsProject.projectType || "other",
      projectDescription: reqsProject.description || "",
      previousStickies: stickies,
      previousSuggestions: suggestions,
      transcriptSoFar,
      newChunk: chunk,
      language: beeSettings.beeLanguage,
    })

    const { object: analysis } = await generateObject({
      model: anthropic("claude-sonnet-4-20250514"),
      prompt,
      schema: chunkAnalysisSchema,
    })

    // 6. Save new stickies
    if (analysis.new_stickies.length > 0) {
      for (const s of analysis.new_stickies) {
        const sticky = await request.prisma.sticky.create({
          data: {
            meetingId,
            reqsProjectId: reqsProject.id,
            category: s.category,
            text: s.text,
            details: s.details || null,
            priority: s.priority,
            source: "ai",
            timestampRef: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
          } as any,
        })

        await publishWsEvent({
          type: "sticky:created",
          tenantId,
          payload: { stickyId: sticky.id, meetingId, reqsProjectId: reqsProject.id },
        })
      }
    }

    // 7. Save new suggestions
    if (analysis.new_suggestions.length > 0) {
      for (const s of analysis.new_suggestions) {
        const suggestion = await request.prisma.aISuggestion.create({
          data: {
            meetingId,
            suggestionType: s.type,
            text: s.text,
            reason: s.reason,
            urgency: s.urgency,
            dimension: s.dimension,
          } as any,
        })

        await publishWsEvent({
          type: "suggestion:created",
          tenantId,
          payload: { suggestionId: suggestion.id, meetingId },
        })
      }
    }

    // 8. Update meeting summary
    if (analysis.summary_update) {
      await request.prisma.meeting.update({
        where: { id: meetingId },
        data: { summary: analysis.summary_update },
      })

      await publishWsEvent({
        type: "meeting:updated",
        tenantId,
        payload: { meetingId, reqsProjectId: reqsProject.id },
      })
    }

    return {
      success: true,
      stickies_added: analysis.new_stickies.length,
      suggestions_added: analysis.new_suggestions.length,
      alerts: analysis.alerts,
    }
  })
}
