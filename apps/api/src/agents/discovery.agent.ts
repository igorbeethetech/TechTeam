import { z } from "zod"
import { zodToJsonSchema } from "zod-to-json-schema"
import { executeAgent } from "./base-agent.js"
import { discoveryOutputSchema } from "@techteam/shared"
import { prisma } from "@techteam/database"

/**
 * Builds the system + user prompt for the Discovery agent.
 * Provides demand context and project tech stack so the agent
 * can produce accurate requirements analysis.
 */
function buildDiscoveryPrompt(
  demand: { title: string; description: string | null },
  project: { name: string; techStack: string; repoUrl: string }
): string {
  const systemContext = [
    "You are a software requirements analyst.",
    "Analyze the following development demand and produce structured requirements.",
    "Be thorough but concise.",
    "If any part of the demand is ambiguous, unclear, or missing critical information, add it to the ambiguities array.",
  ].join(" ")

  const userPrompt = [
    `## Project`,
    `- **Name:** ${project.name}`,
    `- **Tech Stack:** ${project.techStack}`,
    `- **Repository:** ${project.repoUrl}`,
    ``,
    `## Demand`,
    `- **Title:** ${demand.title}`,
    `- **Description:** ${demand.description ?? "(no description provided)"}`,
    ``,
    `## Instructions`,
    `Analyze this demand and produce:`,
    `1. Functional requirements with acceptance criteria`,
    `2. Non-functional requirements by category (performance, security, usability, reliability, maintainability)`,
    `3. Complexity estimate (S=trivial, M=few days, L=week+, XL=major effort)`,
    `4. Any ambiguities that need human clarification before development can begin`,
    `5. A brief summary`,
  ].join("\n")

  return `${systemContext}\n\n${userPrompt}`
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
  const { demandId, projectId, timeout } = params

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
  const result = await executeAgent({
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
