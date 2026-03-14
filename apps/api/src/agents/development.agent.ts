import { zodToJsonSchema } from "zod-to-json-schema"
import { executeAgentAuto } from "./agent-router.js"
import { developmentOutputSchema, type DevelopmentOutput } from "@techteam/shared"
import { prisma } from "@techteam/database"
import { config } from "../lib/config.js"
import { matchSkills, buildSkillsPromptSection } from "../lib/skills.js"
import { getLanguageInstruction, getTenantLanguage } from "../lib/i18n.js"

/**
 * Builds the system + user prompt for the Development agent.
 * Provides plan, requirements, project context, and optional rejection feedback
 * so the agent can implement code changes in the repository.
 */
function buildDevelopmentPrompt(
  demand: { title: string; description: string | null },
  project: {
    name: string
    techStack: string
    repoUrl: string
    repoPath: string
    defaultBranch: string
  },
  plan: unknown,
  requirements: unknown,
  rejectionFeedback: unknown | undefined,
  skillsSection: string
): string {
  const parts: string[] = []

  parts.push(
    [
      `## Project`,
      `- **Name:** ${project.name}`,
      `- **Tech Stack:** ${project.techStack}`,
      `- **Repository:** ${project.repoUrl}`,
      `- **Repo Path:** ${project.repoPath}`,
      `- **Default Branch:** ${project.defaultBranch}`,
    ].join("\n")
  )

  parts.push(
    [
      `## Demand`,
      `- **Title:** ${demand.title}`,
      `- **Description:** ${demand.description ?? "(no description provided)"}`,
    ].join("\n")
  )

  parts.push(
    [
      `## Implementation Plan`,
      "```json",
      JSON.stringify(plan, null, 2),
      "```",
    ].join("\n")
  )

  parts.push(
    [
      `## Requirements`,
      "```json",
      JSON.stringify(requirements, null, 2),
      "```",
    ].join("\n")
  )

  if (rejectionFeedback) {
    parts.push(
      [
        `## Previous Review Feedback`,
        "",
        "The previous implementation was rejected by the testing agent. Address the specific issues below:",
        "",
        "```json",
        JSON.stringify(rejectionFeedback, null, 2),
        "```",
        "",
        "Focus on fixing the issues flagged in the review. Do not rewrite code that was not flagged.",
      ].join("\n")
    )
  }

  if (skillsSection) {
    parts.push(skillsSection)
  }

  parts.push(
    [
      `## Instructions`,
      `Implement the tasks from the plan above by reading the existing codebase and making the necessary code changes.`,
      `Use the tools available to you (Read, Write, Edit, Bash, Glob, Grep) to navigate and modify the codebase.`,
      ``,
      `IMPORTANT: Do NOT run any git commands (git add, git commit, git push, git checkout, etc.) -- git operations are handled externally.`,
      `You may run project commands like npm install, npm build, npm test, etc.`,
      ``,
      `After completing all changes, provide a structured summary of what you did.`,
    ].join("\n")
  )

  return parts.join("\n\n")
}

export interface DevelopmentAgentParams {
  demandId: string
  tenantId: string
  projectId: string
  timeout: number
  rejectionFeedback?: unknown // Previous testing agent output if this is a retry after rejection
}

export interface DevelopmentAgentResult {
  output: DevelopmentOutput | null // Structured output may fail for complex code gen; null = fallback
  skillsUsed: string[]
  tokensIn: number
  tokensOut: number
  costUsd: number
  durationMs: number
}

/**
 * Runs the Development phase agent.
 * Takes a planning agent's task plan + discovery requirements and implements
 * the code changes in the project repository using file system tools.
 *
 * This is a pure function: reads context from DB, calls the AI, returns results.
 * The worker (agent.worker.ts) handles all DB writes, stage advancement, git operations,
 * and PR creation.
 */
export async function runDevelopmentAgent(
  params: DevelopmentAgentParams
): Promise<DevelopmentAgentResult> {
  const { demandId, tenantId, projectId, timeout, rejectionFeedback } = params

  // Fetch demand (raw prisma -- no tenant scope needed for reads)
  const demand = await prisma.demand.findUniqueOrThrow({
    where: { id: demandId },
  })

  // Verify plan exists (required from planning phase)
  if (!demand.plan) {
    throw new Error(
      "Cannot run development without a plan. " +
        "Ensure planning phase completed successfully before running development."
    )
  }

  // Verify requirements exist (required from discovery phase)
  if (!demand.requirements) {
    throw new Error(
      "Cannot run development without requirements. " +
        "Ensure discovery phase completed successfully before running development."
    )
  }

  // Fetch project for context
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
  })

  // Match relevant skills for this phase
  const skills = await matchSkills({
    tenantId,
    phase: "development",
    demandTitle: demand.title,
    demandDescription: demand.description,
    techStack: project.techStack,
  })
  const skillsSection = buildSkillsPromptSection(skills)

  // Fetch tenant language for i18n
  const language = await getTenantLanguage(tenantId)
  const languageInstruction = getLanguageInstruction(language)

  // Build contextual prompt with plan, requirements, and optional rejection feedback
  const prompt = buildDevelopmentPrompt(
    demand,
    project,
    demand.plan,
    demand.requirements,
    rejectionFeedback,
    skillsSection
  )

  // Convert Zod schema to JSON Schema for structured output
  const jsonSchema = zodToJsonSchema(developmentOutputSchema)

  // Build system prompt with language instruction
  const baseSystemPrompt = "You are a senior software developer implementing code changes in a repository. Do NOT run any git commands."
  const systemPrompt = languageInstruction
    ? `${baseSystemPrompt}\n\n${languageInstruction}`
    : baseSystemPrompt

  // Call the AI agent with file system tools and higher turn limit
  const result = await executeAgentAuto(tenantId, {
    demandId,
    prompt,
    schema: jsonSchema as Record<string, unknown>,
    timeoutMs: timeout,
    cwd: project.repoPath,
    allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
    maxTurns: 50,
    model: config.CLAUDE_DEV_MODEL,
    systemPrompt,
  })

  // Try to parse structured output. For complex code generation, the agent
  // may exhaust turns before producing structured output, so we handle failure gracefully.
  const parsed = developmentOutputSchema.safeParse(result.output)

  return {
    output: parsed.success ? parsed.data : null,
    skillsUsed: skills.map((s) => s.name),
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    costUsd: result.costUsd,
    durationMs: result.durationMs,
  }
}
