import { z } from "zod"

export const clientCreateSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  slug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  sector: z.enum(["education", "healthcare", "legal", "insurance", "finance", "retail", "technology", "other"]),
  description: z.string().max(1000).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#6c5ce7"),
  logoUrl: z.string().url().optional(),
  contactName: z.string().max(100).optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().max(30).optional(),
})

export const clientUpdateSchema = clientCreateSchema.partial()

export type ClientCreate = z.infer<typeof clientCreateSchema>
export type ClientUpdate = z.infer<typeof clientUpdateSchema>
