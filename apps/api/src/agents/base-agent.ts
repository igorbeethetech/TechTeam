import { query, type SDKResultMessage } from "@anthropic-ai/claude-agent-sdk"
import { config } from "../lib/config.js"
import { registerProcess, unregisterProcess } from "../lib/process-registry.js"

export interface AgentExecutionParams {
  prompt: string
  schema?: Record<string, unknown>
  timeoutMs: number
  cwd?: string
  /** Tool names to enable. Empty or undefined = no tools (discovery/planning). */
  allowedTools?: string[]
  /** Max agentic turns. Defaults to 5 (discovery/planning). Development uses 50. */
  maxTurns?: number
  /** Optional system prompt override. */
  systemPrompt?: string
  /** Optional model override. Defaults to config.CLAUDE_MODEL. */
  model?: string
  /** Demand ID for process registry (cancel support). */
  demandId?: string
  /** AgentRun ID for process registry. */
  agentRunId?: string
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
 * Invokes Claude via the Agent SDK with optional structured JSON output,
 * tool-enabled execution, timeout support, and cost/token tracking.
 *
 * Discovery/Planning agents: no tools, low maxTurns, required schema.
 * Development/Testing agents: file system tools, high maxTurns, optional schema.
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

  // Register process for cancellation support
  if (params.demandId) {
    registerProcess({
      demandId: params.demandId,
      agentRunId: params.agentRunId ?? "",
      type: "sdk",
      abortController,
    })
  }

  const hasTools =
    params.allowedTools !== undefined && params.allowedTools.length > 0

  // Use Promise.race to guarantee timeout even if AbortController doesn't propagate
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      abortController.abort()
      reject(new Error(`Agent execution timed out after ${params.timeoutMs}ms`))
    }, params.timeoutMs)
  })

  const agentPromise = (async (): Promise<AgentExecutionResult> => {
    let result: SDKResultMessage | null = null

    for await (const message of query({
      prompt: params.prompt,
      options: {
        abortController,
        model: params.model ?? config.CLAUDE_MODEL,
        maxTurns: params.maxTurns ?? 5,
        outputFormat: params.schema
          ? { type: "json_schema", schema: params.schema }
          : undefined,
        cwd: params.cwd,
        // When tools are needed, specify which built-in tools are available
        // and auto-allow them. When no tools needed, disable all built-in tools.
        tools: hasTools ? params.allowedTools : [],
        allowedTools: hasTools ? params.allowedTools : undefined,
        systemPrompt: params.systemPrompt,
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
  })()

  try {
    return await Promise.race([agentPromise, timeoutPromise])
  } finally {
    if (params.demandId) unregisterProcess(params.demandId)
  }
}
