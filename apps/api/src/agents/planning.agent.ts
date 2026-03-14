import { zodToJsonSchema } from "zod-to-json-schema"
import { executeAgentAuto } from "./agent-router.js"
import { planningOutputSchema } from "@techteam/shared"
import { prisma } from "@techteam/database"
import { matchSkills, buildSkillsPromptSection } from "../lib/skills.js"
import { getLanguageInstruction, getTenantLanguage } from "../lib/i18n.js"

/**
 * Builds the system + user prompt for the Planning agent.
 * Provides discovery requirements + project context so the agent
 * can produce a decomposed technical implementation plan.
 */
function buildPlanningPrompt(
  demand: { title: string; description: string | null },
  project: {
    name: string
    techStack: string
    repoUrl: string
    repoPath: string
    defaultBranch: string
  },
  requirements: unknown,
  skillsSection: string,
  languageInstruction: string
): string {
  const userPrompt = [
    `## Project`,
    `- **Name:** ${project.name}`,
    `- **Tech Stack:** ${project.techStack}`,
    `- **Repository:** ${project.repoUrl}`,
    `- **Local Path:** ${project.repoPath}`,
    `- **Default Branch:** ${project.defaultBranch}`,
    ``,
    `## Demand`,
    `- **Title:** ${demand.title}`,
    `- **Description:** ${demand.description ?? "(no description provided)"}`,
    ``,
    `## Discovery Requirements`,
    `\`\`\`json`,
    JSON.stringify(requirements, null, 2),
    `\`\`\``,
    ``,
    ...(skillsSection ? [skillsSection, ``] : []),
    ...(languageInstruction ? [languageInstruction, ``] : []),
    `## Instructions`,
    ``,
    `You have access to the project's source code at: ${project.repoPath}`,
    `Use the tools (Glob, Grep, Read) to examine the actual code referenced in the requirements before planning.`,
    ``,
    `Create a technical implementation plan that:`,
    `1. Decomposes the work into discrete tasks, each with a clear description and type (create/modify/delete/test/config)`,
    `2. Lists specific files that will be created or modified for each task (verify they exist by reading the codebase)`,
    `3. Defines dependencies between tasks (which task must complete before another can start)`,
    `4. Orders tasks for optimal execution`,
    `5. Identifies risk areas that need extra attention`,
    `6. Provides a brief summary of the overall approach`,
    ``,
    `IMPORTANT: Do NOT modify any files. Only read and analyze.`,
  ].join("\n")

  return userPrompt
}

export interface PlanningAgentParams {
  demandId: string
  tenantId: string
  projectId: string
  timeout: number
}

export interface PlanningAgentResult {
  output: import("@techteam/shared").PlanningOutput
  skillsUsed: string[]
  tokensIn: number
  tokensOut: number
  costUsd: number
  durationMs: number
}

/**
 * Runs the Planning phase agent.
 * Takes discovery requirements + project context and produces a structured
 * task decomposition with file mappings, dependencies, and execution order.
 *
 * This is a pure function: reads context from DB, calls the AI, returns results.
 * The worker (agent.worker.ts) handles all DB writes, stage advancement, and job chaining.
 */
export async function runPlanningAgent(
  params: PlanningAgentParams
): Promise<PlanningAgentResult> {
  const { demandId, tenantId, projectId, timeout } = params

  // Fetch demand (raw prisma -- no tenant scope needed for reads)
  const demand = await prisma.demand.findUniqueOrThrow({
    where: { id: demandId },
  })

  // Extract requirements from Discovery phase output
  if (!demand.requirements) {
    throw new Error(
      "Cannot run planning without discovery requirements. " +
        "Ensure discovery phase completed successfully before running planning."
    )
  }

  // Fetch project for context
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
  })

  // Match relevant skills for this phase
  const skills = await matchSkills({
    tenantId,
    phase: "planning",
    demandTitle: demand.title,
    demandDescription: demand.description,
    techStack: project.techStack,
  })
  const skillsSection = buildSkillsPromptSection(skills)

  // Fetch tenant language for i18n
  const language = await getTenantLanguage(tenantId)
  const languageInstruction = getLanguageInstruction(language)

  // Build contextual prompt with discovery requirements
  const prompt = buildPlanningPrompt(demand, project, demand.requirements, skillsSection, languageInstruction)

  // Convert Zod schema to JSON Schema for structured output
  const jsonSchema = zodToJsonSchema(planningOutputSchema)

  // Build system prompt
  const baseSystemPrompt = [
    "You are a senior software architect with access to the project's source code.",
    "Examine the codebase to produce accurate implementation plans with real file paths.",
    "Do NOT modify any files. Only read and analyze.",
  ].join(" ")
  const systemPrompt = languageInstruction
    ? `${baseSystemPrompt}\n\n${languageInstruction}`
    : baseSystemPrompt

  // Call the AI agent with read-only tools so it can verify file paths and code structure
  const result = await executeAgentAuto(tenantId, {
    demandId,
    prompt,
    schema: jsonSchema as Record<string, unknown>,
    timeoutMs: timeout,
    cwd: project.repoPath,
    allowedTools: ["Read", "Glob", "Grep"],
    maxTurns: 15,
    systemPrompt,
  })

  // Parse and validate the structured output
  if (result.output === undefined || result.output === null) {
    throw new Error(
      `Planning agent returned empty output (${typeof result.output}). ` +
        `This usually means the CLI did not produce structured JSON. ` +
        `CostUsd=${result.costUsd}, DurationMs=${result.durationMs}`
    )
  }
  const output = planningOutputSchema.parse(result.output)

  return {
    output,
    skillsUsed: skills.map((s) => s.name),
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    costUsd: result.costUsd,
    durationMs: result.durationMs,
  }
}
