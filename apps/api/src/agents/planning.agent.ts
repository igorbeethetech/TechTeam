import { zodToJsonSchema } from "zod-to-json-schema"
import { executeAgentAuto } from "./agent-router.js"
import { planningOutputSchema } from "@techteam/shared"
import { prisma } from "@techteam/database"

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
  requirements: unknown
): string {
  const systemContext = [
    "You are a senior software architect.",
    "Given the requirements from a discovery phase, produce a detailed technical implementation plan.",
    "Break down the work into discrete tasks with specific file paths and dependencies between tasks.",
  ].join(" ")

  const userPrompt = [
    `## Project`,
    `- **Name:** ${project.name}`,
    `- **Tech Stack:** ${project.techStack}`,
    `- **Repository:** ${project.repoUrl}`,
    `- **Repo Path:** ${project.repoPath}`,
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
    `## Instructions`,
    `Create a technical implementation plan that:`,
    `1. Decomposes the work into discrete tasks, each with a clear description and type (create/modify/delete/test/config)`,
    `2. Lists specific files that will be created or modified for each task`,
    `3. Defines dependencies between tasks (which task must complete before another can start)`,
    `4. Orders tasks for optimal execution`,
    `5. Identifies risk areas that need extra attention`,
    `6. Provides a brief summary of the overall approach`,
  ].join("\n")

  return `${systemContext}\n\n${userPrompt}`
}

export interface PlanningAgentParams {
  demandId: string
  tenantId: string
  projectId: string
  timeout: number
}

export interface PlanningAgentResult {
  output: import("@techteam/shared").PlanningOutput
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

  // Build contextual prompt with discovery requirements
  const prompt = buildPlanningPrompt(demand, project, demand.requirements)

  // Convert Zod schema to JSON Schema for structured output
  // Using zod-to-json-schema because z.toJSONSchema() is only in Zod v4 namespace
  // and our schemas are defined with Zod v3 API in @techteam/shared
  const jsonSchema = zodToJsonSchema(planningOutputSchema)

  // Call the AI agent
  const result = await executeAgentAuto(tenantId, {
    prompt,
    schema: jsonSchema as Record<string, unknown>,
    timeoutMs: timeout,
  })

  // Parse and validate the structured output
  const output = planningOutputSchema.parse(result.output)

  return {
    output,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    costUsd: result.costUsd,
    durationMs: result.durationMs,
  }
}
