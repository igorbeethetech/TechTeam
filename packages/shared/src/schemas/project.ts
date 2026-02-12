import { z } from "zod"

export const projectCreateSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  repoUrl: z.string().url(),
  repoPath: z.string().min(1),
  techStack: z.string().min(1),
  maxConcurrentDev: z.number().int().min(1).max(3).default(1),
  mergeStrategy: z.enum(["fifo", "priority"]).default("fifo"),
})

export const projectUpdateSchema = projectCreateSchema.partial()

export type ProjectCreate = z.infer<typeof projectCreateSchema>
export type ProjectUpdate = z.infer<typeof projectUpdateSchema>
