import { zodToJsonSchema } from "zod-to-json-schema"
import { executeAgent } from "./base-agent.js"
import { mergeResolverOutputSchema } from "@techteam/shared"
import { config } from "../lib/config.js"

export interface MergeResolverParams {
  demandId: string
  tenantId: string
  projectId: string
  repoPath: string
  branchName: string
  defaultBranch: string
  conflictFiles: string[]
  timeout: number
}

export interface MergeResolverResult {
  resolved: boolean
  output: unknown
  tokensIn: number
  tokensOut: number
  costUsd: number
  durationMs: number
}

/**
 * Runs the Merge Resolver agent.
 * Reads git conflict markers in the working directory and attempts to resolve
 * them semantically using Claude. After resolution, stages all resolved files.
 *
 * This is a pure agent function: takes params, calls AI, returns results.
 * The merge worker handles all DB writes, git operations, and error recovery.
 */
export async function runMergeResolverAgent(
  params: MergeResolverParams
): Promise<MergeResolverResult> {
  const {
    repoPath,
    branchName,
    defaultBranch,
    conflictFiles,
    timeout,
  } = params

  // Build the conflict resolution prompt
  const prompt = [
    "You are resolving merge conflicts in a repository.",
    "",
    `The branch \`${branchName}\` is being merged into \`${defaultBranch}\`.`,
    "",
    `The following files have conflicts: ${conflictFiles.join(", ")}`,
    "",
    "Your task:",
    "1) Read each conflicted file.",
    `2) Understand both sides of the conflict (the content between <<<<<<< HEAD and =======, and between ======= and >>>>>>> ${branchName}).`,
    "3) Resolve each conflict by choosing the correct resolution that preserves both changes when possible.",
    "4) Write the resolved file content (removing ALL conflict markers).",
    "5) After resolving all files, run `git add .` to stage the resolutions.",
    "6) Do NOT run git commit, git merge, or git push.",
    "",
    "IMPORTANT: You must remove ALL conflict markers (<<<<<<< ======= >>>>>>>). Partially resolved files are worse than unresolved ones.",
  ].join("\n")

  // Convert Zod schema to JSON Schema for structured output
  const jsonSchema = zodToJsonSchema(mergeResolverOutputSchema)

  // Call the AI agent with file system tools
  const result = await executeAgent({
    prompt,
    schema: jsonSchema as Record<string, unknown>,
    timeoutMs: timeout,
    cwd: repoPath,
    allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
    maxTurns: 30,
    systemPrompt:
      "You are an expert merge conflict resolver. You understand code semantics and can merge changes from two branches intelligently. Your goal is to produce clean, working code that incorporates changes from both sides. When in doubt, prefer the feature branch changes but preserve all functionality.",
    model: config.CLAUDE_DEV_MODEL,
  })

  // Parse the structured output
  const parsed = mergeResolverOutputSchema.safeParse(result.output)

  if (!parsed.success) {
    return {
      resolved: false,
      output: null,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: result.costUsd,
      durationMs: result.durationMs,
    }
  }

  return {
    resolved: parsed.data.resolved && parsed.data.unresolvedFiles.length === 0,
    output: parsed.data,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    costUsd: result.costUsd,
    durationMs: result.durationMs,
  }
}
