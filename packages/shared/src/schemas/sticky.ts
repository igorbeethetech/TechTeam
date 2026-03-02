import { z } from "zod"

export const stickyCreateSchema = z.object({
  meetingId: z.string().min(1, "Meeting is required"),
  reqsProjectId: z.string().min(1, "Project is required"),
  category: z.enum([
    "problem", "process", "requirement", "integration",
    "risk", "decision", "question", "scope", "persona",
    "constraint", "assumption",
  ]),
  text: z.string().min(1).max(300),
  details: z.string().max(2000).optional(),
  priority: z.enum(["critical", "high", "medium", "low"]).default("medium"),
  source: z.enum(["ai", "manual"]).default("manual"),
  tags: z.array(z.string()).default([]),
})

export const stickyUpdateSchema = z.object({
  category: z.enum([
    "problem", "process", "requirement", "integration",
    "risk", "decision", "question", "scope", "persona",
    "constraint", "assumption",
  ]).optional(),
  text: z.string().min(1).max(300).optional(),
  details: z.string().max(2000).optional(),
  priority: z.enum(["critical", "high", "medium", "low"]).optional(),
  status: z.enum(["open", "confirmed", "rejected", "deferred"]).optional(),
  boardColumn: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

export type StickyCreate = z.infer<typeof stickyCreateSchema>
export type StickyUpdate = z.infer<typeof stickyUpdateSchema>
