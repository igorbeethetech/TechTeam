import { z } from "zod"

export const projectCreateSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  repoUrl: z.string().url(),
  repoPath: z.string().min(1),
  techStack: z.string().min(1),
  maxConcurrentDev: z.number().int().min(1).max(3).default(1),
  mergeStrategy: z.enum(["fifo", "priority"]).default("fifo"),
  testInstructions: z.string().max(2000).optional(),
  previewUrlTemplate: z.string().max(500).optional(),
})

export const projectUpdateSchema = projectCreateSchema.partial()

export const projectInitSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  repoName: z
    .string()
    .min(1)
    .max(100)
    .regex(
      /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/,
      "Must start with a letter or number and contain only letters, numbers, dots, hyphens, or underscores"
    ),
  orgLogin: z.string().min(1),
  visibility: z.enum(["public", "private"]).default("private"),
  localPath: z.string().min(1),
  techStack: z.string().min(1),
  maxConcurrentDev: z.number().int().min(1).max(3).default(1),
  mergeStrategy: z.enum(["fifo", "priority"]).default("fifo"),
  testInstructions: z.string().max(2000).optional(),
  previewUrlTemplate: z.string().max(500).optional(),
})

export type ProjectCreate = z.infer<typeof projectCreateSchema>
export type ProjectUpdate = z.infer<typeof projectUpdateSchema>
export type ProjectInit = z.infer<typeof projectInitSchema>
