import { z } from "zod"

export const demandCreateSchema = z.object({
  projectId: z.string().min(1, "Project is required"),
  title: z.string().min(2, "Title must be at least 2 characters").max(200),
  description: z.string().max(5000).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
})

export const demandUpdateSchema = demandCreateSchema.partial().omit({ projectId: true })

export const demandStageUpdateSchema = z.object({
  stage: z.enum(["inbox", "discovery", "planning", "development", "testing", "review", "done"]),
})

export type DemandCreate = z.infer<typeof demandCreateSchema>
export type DemandUpdate = z.infer<typeof demandUpdateSchema>
export type DemandStageUpdate = z.infer<typeof demandStageUpdateSchema>
