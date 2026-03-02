import { z } from "zod"

export const analyzeChunkRequestSchema = z.object({
  meetingId: z.string().min(1, "Meeting ID is required"),
  chunk: z.string().min(1, "Chunk text is required"),
  chunkIndex: z.number().int().min(0).default(0),
  timestampStart: z.number().optional(),
  timestampEnd: z.number().optional(),
})

export const chunkAnalysisSchema = z.object({
  new_stickies: z.array(
    z.object({
      category: z.enum([
        "problem", "process", "requirement", "integration",
        "risk", "decision", "question", "scope", "persona",
        "constraint", "assumption",
      ]),
      text: z.string().max(150),
      details: z.string().optional(),
      priority: z.enum(["critical", "high", "medium", "low"]),
    })
  ),
  new_suggestions: z.array(
    z.object({
      type: z.enum(["question", "alert", "insight", "risk_warning"]),
      text: z.string(),
      reason: z.string(),
      urgency: z.enum(["critical", "high", "medium", "low"]),
      dimension: z.enum([
        "scope", "exceptions", "data", "permissions", "volume",
        "integrations", "business_rules", "sla", "migration",
        "compliance", "dependencies", "acceptance_criteria",
      ]),
    })
  ),
  alerts: z.array(
    z.object({
      type: z.string(),
      description: z.string(),
    })
  ),
  summary_update: z.string().nullable(),
})

export type AnalyzeChunkRequest = z.infer<typeof analyzeChunkRequestSchema>
export type ChunkAnalysis = z.infer<typeof chunkAnalysisSchema>
