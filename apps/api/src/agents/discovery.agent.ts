import { z } from "zod"
import { zodToJsonSchema } from "zod-to-json-schema"
import { executeAgentAuto } from "./agent-router.js"
import { discoveryOutputSchema } from "@techteam/shared"
import { prisma } from "@techteam/database"
import { matchSkills, buildSkillsPromptSection } from "../lib/skills.js"
import { getLanguageInstruction, getTenantLanguage } from "../lib/i18n.js"
import { gatherCodebaseContext } from "../lib/codebase-context.js"
import { introspectDatabaseSchema } from "../lib/db-introspect.js"

/**
 * Builds the system + user prompt for the Discovery agent.
 * Provides demand context, project tech stack, codebase structure,
 * database schema, and language instructions.
 */
function buildDiscoveryPrompt(
  demand: { title: string; description: string | null; requirements?: unknown },
  project: { name: string; techStack: string; repoUrl: string; repoPath: string },
  skillsSection: string,
  codebaseContext: string | null,
  dbSchema: string | null,
  languageInstruction: string
): string {
  const userPromptParts = [
    `## Project`,
    `- **Name:** ${project.name}`,
    `- **Tech Stack:** ${project.techStack}`,
    `- **Repository:** ${project.repoUrl}`,
    `- **Local Path:** ${project.repoPath}`,
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

  // Codebase context (pre-gathered from local filesystem)
  if (codebaseContext) {
    userPromptParts.push(``)
    userPromptParts.push(`## Codebase Overview`)
    userPromptParts.push(`The following is a high-level summary of the project's structure. Use the tools (Read, Glob, Grep) to explore specific files in depth.`)
    userPromptParts.push(codebaseContext)
  }

  // Database schema (introspected from project's PostgreSQL)
  if (dbSchema) {
    userPromptParts.push(``)
    userPromptParts.push(`## Database Schema`)
    userPromptParts.push(`The following is the current database schema of the project.`)
    userPromptParts.push(dbSchema)
  }

  if (skillsSection) {
    userPromptParts.push(``)
    userPromptParts.push(skillsSection)
  }

  // Language instruction
  if (languageInstruction) {
    userPromptParts.push(``)
    userPromptParts.push(languageInstruction)
  }

  userPromptParts.push(``)
  userPromptParts.push(`## Instructions`)
  userPromptParts.push(``)
  userPromptParts.push(`You have access to the project's source code at: ${project.repoPath}`)
  userPromptParts.push(`Use the tools (Glob, Grep, Read) to explore the codebase and understand the existing implementation before writing requirements.`)
  userPromptParts.push(``)
  userPromptParts.push(`Follow this process:`)
  userPromptParts.push(`1. **Investigate the codebase**: Use Glob to find relevant files, Grep to search for key functions/classes/patterns mentioned in the demand, and Read to examine the actual source code. Understand HOW the current code works.`)
  userPromptParts.push(`2. **Identify the root cause** (for bugs) or **map the affected area** (for features): Trace the code flow, find the relevant functions, components, API endpoints, and data models.`)
  userPromptParts.push(`3. **Produce structured requirements** based on your code analysis:`)
  userPromptParts.push(`   - Functional requirements with acceptance criteria (reference specific files/functions)`)
  userPromptParts.push(`   - Non-functional requirements by category (performance, security, usability, reliability, maintainability)`)
  userPromptParts.push(`   - Complexity estimate (S=trivial, M=few days, L=week+, XL=major effort)`)
  userPromptParts.push(`   - Ambiguities ONLY for things you cannot determine from the code (business decisions, UX preferences, etc.)`)
  userPromptParts.push(`   - A brief summary referencing the specific code areas you investigated`)
  userPromptParts.push(``)
  userPromptParts.push(`IMPORTANT: Do NOT add ambiguities about things visible in the codebase. Read the code first, then only ask about what you genuinely cannot determine.`)
  userPromptParts.push(`IMPORTANT: Do NOT modify any files. Your job is to READ and ANALYZE only.`)

  return userPromptParts.join("\n")
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
  skillsUsed: string[]
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

  // Fetch tenant language for i18n
  const language = await getTenantLanguage(tenantId)
  const languageInstruction = getLanguageInstruction(language)

  // Gather codebase context from local repo (graceful - never blocks agent)
  let codebaseContext: string | null = null
  try {
    const ctx = await gatherCodebaseContext(project.repoPath)
    if (ctx.success) codebaseContext = ctx.context
  } catch (err) {
    console.warn("[discovery] Failed to gather codebase context:", err)
  }

  // Gather database schema if project has a databaseUrl (graceful)
  let dbSchema: string | null = null
  try {
    if ((project as any).databaseUrl) {
      const schema = await introspectDatabaseSchema((project as any).databaseUrl)
      if (schema.success) dbSchema = schema.schema
    }
  } catch (err) {
    console.warn("[discovery] Failed to introspect database schema:", err)
  }

  // Match relevant skills for this phase
  const skills = await matchSkills({
    tenantId,
    phase: "discovery",
    demandTitle: demand.title,
    demandDescription: demand.description,
    techStack: project.techStack,
  })
  const skillsSection = buildSkillsPromptSection(skills)

  // Build contextual prompt
  const prompt = buildDiscoveryPrompt(demand, project, skillsSection, codebaseContext, dbSchema, languageInstruction)

  // Convert Zod schema to JSON Schema for structured output
  const jsonSchema = zodToJsonSchema(discoveryOutputSchema)

  // Build system prompt
  const baseSystemPrompt = [
    "You are a software requirements analyst with access to the project's source code.",
    "Investigate the codebase thoroughly before producing requirements.",
    "Do NOT modify any files. Only read and analyze.",
  ].join(" ")
  const systemPrompt = languageInstruction
    ? `${baseSystemPrompt}\n\n${languageInstruction}`
    : baseSystemPrompt

  // Call the AI agent with read-only tools so it can explore the codebase
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
      `Discovery agent returned empty output (${typeof result.output}). ` +
        `This usually means the CLI did not produce structured JSON. ` +
        `CostUsd=${result.costUsd}, DurationMs=${result.durationMs}`
    )
  }
  const output = discoveryOutputSchema.parse(result.output)

  // Detect ambiguities for pause logic
  const hasAmbiguities = output.ambiguities.length > 0

  return {
    output,
    hasAmbiguities,
    skillsUsed: skills.map((s) => s.name),
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    costUsd: result.costUsd,
    durationMs: result.durationMs,
  }
}
