import { zodToJsonSchema } from "zod-to-json-schema"
import { executeAgent } from "./base-agent.js"
import { testingOutputSchema, type TestingOutput } from "@techteam/shared"
import { prisma } from "@techteam/database"

/**
 * Builds the system + user prompt for the Testing agent.
 * Provides requirements, plan, project context and diff instructions
 * so the agent can review code changes and produce a structured verdict.
 */
function buildTestingPrompt(
  demand: { title: string; description: string | null },
  project: {
    name: string
    techStack: string
    repoUrl: string
    repoPath: string
    defaultBranch: string
  },
  plan: unknown,
  requirements: unknown
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
      `## Requirements`,
      "```json",
      JSON.stringify(requirements, null, 2),
      "```",
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
      `## Review Instructions`,
      ``,
      `Perform a thorough code review and quality assessment:`,
      ``,
      `1. Run \`git diff origin/${project.defaultBranch}...HEAD --stat\` to see what files changed`,
      `2. Run \`git diff origin/${project.defaultBranch}...HEAD\` to see the full diff`,
      `3. Check if a test script exists in package.json; if so, run it`,
      `4. Compare the implementation against each task in the plan above`,
      `5. Compare the implementation against each functional requirement above`,
      `6. Rate each code quality issue by severity (critical, major, minor, suggestion)`,
      `7. Set verdict to "approved" ONLY if:`,
      `   - No critical issues found`,
      `   - Tests pass (or no tests exist)`,
      `   - Implementation addresses the plan tasks`,
      `8. Set verdict to "rejected" with clear rejectionReasons if any critical/major issues are found or tests fail`,
      ``,
      `IMPORTANT: Do NOT modify any code files. Your job is to READ and ANALYZE only.`,
      `You may run tests using Bash (e.g., npm test, npx jest) but do NOT write or edit files.`,
    ].join("\n")
  )

  return parts.join("\n\n")
}

export interface TestingAgentParams {
  demandId: string
  tenantId: string
  projectId: string
  timeout: number
}

export interface TestingAgentResult {
  output: TestingOutput
  approved: boolean
  tokensIn: number
  tokensOut: number
  costUsd: number
  durationMs: number
}

/**
 * Runs the Testing phase agent.
 * Reviews code changes on the current branch against the original plan and
 * requirements, runs tests if available, and produces a structured approval
 * or rejection report.
 *
 * This is a pure function: reads context from DB, calls the AI, returns results.
 * The worker (agent.worker.ts) handles all DB writes, stage advancement,
 * and rejection loop logic.
 */
export async function runTestingAgent(
  params: TestingAgentParams
): Promise<TestingAgentResult> {
  const { demandId, projectId, timeout } = params

  // Fetch demand (raw prisma -- no tenant scope needed for reads)
  const demand = await prisma.demand.findUniqueOrThrow({
    where: { id: demandId },
  })

  // Verify plan exists (required from planning phase)
  if (!demand.plan) {
    throw new Error(
      "Cannot run testing without a plan. " +
        "Ensure planning phase completed successfully before running testing."
    )
  }

  // Verify requirements exist (required from discovery phase)
  if (!demand.requirements) {
    throw new Error(
      "Cannot run testing without requirements. " +
        "Ensure discovery phase completed successfully before running testing."
    )
  }

  // Fetch project for context
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
  })

  // Build contextual prompt with plan, requirements, and review instructions
  const prompt = buildTestingPrompt(
    demand,
    project,
    demand.plan,
    demand.requirements
  )

  // Convert Zod schema to JSON Schema for structured output
  const jsonSchema = zodToJsonSchema(testingOutputSchema)

  // Call the AI agent with read-only tools + Bash (for running tests)
  const result = await executeAgent({
    prompt,
    schema: jsonSchema as Record<string, unknown>,
    timeoutMs: timeout,
    cwd: project.repoPath,
    allowedTools: ["Read", "Glob", "Grep", "Bash"],
    maxTurns: 20,
    systemPrompt:
      "You are a code reviewer. Do NOT modify any files. Only read and analyze.",
  })

  // Parse structured output
  const output = testingOutputSchema.parse(result.output)

  return {
    output,
    approved: output.verdict === "approved",
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    costUsd: result.costUsd,
    durationMs: result.durationMs,
  }
}
