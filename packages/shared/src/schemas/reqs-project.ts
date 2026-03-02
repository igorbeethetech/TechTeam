import { z } from "zod"

export const reqsProjectCreateSchema = z.object({
  clientId: z.string().min(1, "Client is required"),
  name: z.string().min(2, "Name must be at least 2 characters").max(200),
  slug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  description: z.string().max(2000).optional(),
  projectType: z.enum(["automation", "chatbot", "integration", "platform", "rpa", "consulting", "other"]).optional(),
  estimatedHours: z.number().int().min(0).optional(),
  estimatedValue: z.number().min(0).optional(),
  startDate: z.string().optional(),
  deadline: z.string().optional(),
})

export const reqsProjectUpdateSchema = reqsProjectCreateSchema.partial().omit({ clientId: true })

export type ReqsProjectCreate = z.infer<typeof reqsProjectCreateSchema>
export type ReqsProjectUpdate = z.infer<typeof reqsProjectUpdateSchema>
