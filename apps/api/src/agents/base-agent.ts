import { query, type SDKResultMessage } from "@anthropic-ai/claude-agent-sdk"
import { config } from "../lib/config.js"

export interface AgentExecutionParams {
  prompt: string
  schema: Record<string, unknown>
  timeoutMs: number
  cwd?: string
}

export interface AgentExecutionResult {
  output: unknown
  tokensIn: number
  tokensOut: number
  costUsd: number
  durationMs: number
}

/**
 * Reusable agent execution wrapper.
 * Invokes Claude via the Agent SDK with structured JSON output,
 * timeout support, and cost/token tracking.
 */
export async function executeAgent(
  params: AgentExecutionParams
): Promise<AgentExecutionResult> {
  if (!config.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is required for agent execution. Set it in .env"
    )
  }

  const abortController = new AbortController()
  const timer = setTimeout(() => abortController.abort(), params.timeoutMs)

  try {
    let result: SDKResultMessage | null = null

    for await (const message of query({
      prompt: params.prompt,
      options: {
        abortController,
        model: config.CLAUDE_MODEL,
        maxTurns: 5,
        outputFormat: {
          type: "json_schema",
          schema: params.schema,
        },
        cwd: params.cwd,
        tools: [],
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        persistSession: false,
      },
    })) {
      if (message.type === "result") {
        result = message
      }
    }

    if (!result) {
      throw new Error("No result from agent")
    }

    if (result.subtype !== "success") {
      throw new Error(
        `Agent failed: ${result.subtype} - ${result.errors?.join(", ") ?? "unknown error"}`
      )
    }

    return {
      output: result.structured_output,
      tokensIn: result.usage.input_tokens,
      tokensOut: result.usage.output_tokens,
      costUsd: result.total_cost_usd,
      durationMs: result.duration_ms,
    }
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error.name === "AbortError" || error.message.includes("aborted"))
    ) {
      throw new Error(
        `Agent execution timed out after ${params.timeoutMs}ms`
      )
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}
