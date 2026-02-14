import { z } from "zod"
import { zodToJsonSchema } from "zod-to-json-schema"
import { executeAgentAuto } from "./agent-router.js"
import { discoveryOutputSchema } from "@techteam/shared"
import { prisma } from "@techteam/database"

/**
 * Builds the system + user prompt for the Discovery agent.
 * Provides demand context and project tech stack so the agent
 * can produce accurate requirements analysis.
 */
function buildDiscoveryPrompt(
  demand: { title: string; description: string | null; requirements?: unknown },
  project: { name: string; techStack: string; repoUrl: string }
): string {
  const systemContext = [
    "You are a software requirements analyst.",
    "Analyze the following development demand and produce structured requirements.",
    "Be thorough but concise.",
    "If any part of the demand is ambiguous, unclear, or missing critical information, add it to the ambiguities array.",
  ].join(" ")

  const userPromptParts = [
    `## Project`,
    `- **Name:** ${project.name}`,
    `- **Tech Stack:** ${project.techStack}`,
    `- **Repository:** ${project.repoUrl}`,
    ``,
    `## Demand`,
    `- **Title:** ${demand.title}`,
    `- **Description:** ${demand.description ?? "(no description provided)"}`,
  ]

  // Include previous clarifications if available (re-run after human answered ambiguities)
  const reqs = demand.requirements as { clarifications?: { question: string; answer: string }[] } | null
  if (reqs?.clarifications && reqs.clarifications.length > 0) {
    userPromptParts.push(``)
    userPromptParts.push(`## Clarifications Provided by User`)
    userPromptParts.push(`The user has answered the following questions from a previous analysis. Use these answers to resolve ambiguities and produce complete requirements. Only add new ambiguities if there are genuinely new unclear points NOT covered by these answers.`)
    for (const c of reqs.clarifications) {
      userPromptParts.push(`- **Q:** ${c.question}`)
      userPromptParts.push(`  **A:** ${c.answer}`)
    }
  }

  userPromptParts.push(``)
  userPromptParts.push(`## Instructions`)
  userPromptParts.push(`Analyze this demand and produce:`)
  userPromptParts.push(`1. Functional requirements with acceptance criteria`)
  userPromptParts.push(`2. Non-functional requirements by category (performance, security, usability, reliability, maintainability)`)
  userPromptParts.push(`3. Complexity estimate (S=trivial, M=few days, L=week+, XL=major effort)`)
  userPromptParts.push(`4. Any ambiguities that need human clarification before development can begin`)
  userPromptParts.push(`5. A brief summary`)

  return `${systemContext}\n\n${userPromptParts.join("\n")}`
}

export interface DiscoveryAgentParams {
  demandId: string
  tenantId: string
  projectId: string
  timeout: number
}

export interface DiscoveryAgentResult {
  output: z.infer<typeof discoveryOutputSchema>
  hasAmbiguities: boolean
  tokensIn: number
  tokensOut: number
  costUsd: number
  durationMs: number
}

/**
 * Runs the Discovery phase agent.
 * Analyzes a demand description + project context and produces
 * structured requirements with complexity estimation and ambiguity detection.
 *
 * This is a pure function: reads context from DB, calls the AI, returns results.
 * The worker (agent.worker.ts) handles all DB writes, stage advancement, and job chaining.
 */
export async function runDiscoveryAgent(
  params: DiscoveryAgentParams
): Promise<DiscoveryAgentResult> {
  const { demandId, tenantId, projectId, timeout } = params

  // Fetch demand and project for context (raw prisma -- no tenant scope needed for reads)
  const demand = await prisma.demand.findUniqueOrThrow({
    where: { id: demandId },
  })
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
  })

  // Build contextual prompt
  const prompt = buildDiscoveryPrompt(demand, project)

  // Convert Zod schema to JSON Schema for structured output
  // Using zod-to-json-schema because z.toJSONSchema() is only in Zod v4 namespace
  // and our schemas are defined with Zod v3 API in @techteam/shared
  const jsonSchema = zodToJsonSchema(discoveryOutputSchema)

  // Call the AI agent
  const result = await executeAgentAuto(tenantId, {
    prompt,
    schema: jsonSchema as Record<string, unknown>,
    timeoutMs: timeout,
  })

  // Parse and validate the structured output
  const output = discoveryOutputSchema.parse(result.output)

  // Detect ambiguities for pause logic
  const hasAmbiguities = output.ambiguities.length > 0

  return {
    output,
    hasAmbiguities,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    costUsd: result.costUsd,
    durationMs: result.durationMs,
  }
}
