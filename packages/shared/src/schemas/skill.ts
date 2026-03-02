import { z } from "zod"

export const SKILL_CATEGORIES = [
  "frontend",
  "backend",
  "devops",
  "quality",
  "design",
  "integrations",
  "general",
] as const

export type SkillCategory = (typeof SKILL_CATEGORIES)[number]

export const AGENT_PHASES = [
  "discovery",
  "planning",
  "development",
  "testing",
] as const

export type AgentPhase = (typeof AGENT_PHASES)[number]

export const skillCreateSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().min(2).max(300),
  instructions: z.string().min(10).max(5000),
  tags: z.array(z.string().min(1).max(50)).min(1).max(20),
  applicablePhases: z.array(z.enum(AGENT_PHASES)).min(1),
  category: z.enum(SKILL_CATEGORIES),
  enabled: z.boolean().default(true),
})

export const skillUpdateSchema = skillCreateSchema.partial()

export type SkillCreate = z.infer<typeof skillCreateSchema>
export type SkillUpdate = z.infer<typeof skillUpdateSchema>
