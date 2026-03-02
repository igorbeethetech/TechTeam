import { prisma } from "@techteam/database"

interface MatchSkillsContext {
  tenantId: string
  phase: string
  demandTitle: string
  demandDescription: string | null
  techStack: string
}

interface MatchedSkill {
  id: string
  name: string
  instructions: string
  matchScore: number
}

const MAX_SKILLS = 5

/**
 * Matches skills relevant to the current demand + phase.
 * Uses raw prisma (not tenant-scoped) to include global defaults (tenantId=null)
 * plus tenant-specific skills.
 *
 * Matching: case-insensitive substring of skill tags against
 * demand title + description + project techStack.
 */
export async function matchSkills(
  ctx: MatchSkillsContext
): Promise<MatchedSkill[]> {
  // Fetch all enabled skills for this phase (tenant + global defaults)
  const candidates = await prisma.skill.findMany({
    where: {
      enabled: true,
      applicablePhases: { has: ctx.phase },
      OR: [{ tenantId: ctx.tenantId }, { tenantId: null }],
    },
  })

  if (candidates.length === 0) return []

  // Build searchable text from demand context
  const searchText = [
    ctx.demandTitle,
    ctx.demandDescription ?? "",
    ctx.techStack,
  ]
    .join(" ")
    .toLowerCase()

  // Score each skill by counting tag matches
  const scored: MatchedSkill[] = []
  for (const skill of candidates) {
    let matchScore = 0
    for (const tag of skill.tags) {
      if (searchText.includes(tag.toLowerCase())) {
        matchScore++
      }
    }
    if (matchScore > 0) {
      scored.push({
        id: skill.id,
        name: skill.name,
        instructions: skill.instructions,
        matchScore,
      })
    }
  }

  // Sort by score descending, take top N
  scored.sort((a, b) => b.matchScore - a.matchScore)
  return scored.slice(0, MAX_SKILLS)
}

/**
 * Formats matched skills as a prompt section to inject into agent prompts.
 * Returns empty string if no skills matched.
 */
export function buildSkillsPromptSection(skills: MatchedSkill[]): string {
  if (skills.length === 0) return ""

  const lines = [
    `## Applied Skills`,
    `The following specialized knowledge has been matched for this task. Apply these guidelines where relevant:`,
    ``,
  ]

  for (const skill of skills) {
    lines.push(`### ${skill.name}`)
    lines.push(skill.instructions)
    lines.push(``)
  }

  return lines.join("\n")
}
