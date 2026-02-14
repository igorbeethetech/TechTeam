import { spawn } from "node:child_process"
import type { AgentExecutionParams, AgentExecutionResult } from "./base-agent.js"

/**
 * CLI executor for Claude MAX mode.
 * Spawns `claude` CLI subprocess with JSON output and returns AgentExecutionResult
 * matching the same interface as the SDK executor (executeAgent).
 *
 * Prompt is piped via stdin to avoid command-line length limits.
 * The CLI reads from stdin when no `-p` argument is provided.
 */
export async function executeAgentCli(
  params: AgentExecutionParams
): Promise<AgentExecutionResult> {
  const args: string[] = [
    "--output-format",
    "json",
    "--max-turns",
    String(params.maxTurns ?? 5),
    "--no-session-persistence",
  ]

  // Add JSON schema for structured output
  if (params.schema) {
    args.push("--json-schema", JSON.stringify(params.schema))
  }

  // Add system prompt
  if (params.systemPrompt) {
    args.push("--system-prompt", params.systemPrompt)
  }

  // Add allowed tools -- each tool as a separate arg after --allowedTools
  if (params.allowedTools && params.allowedTools.length > 0) {
    args.push("--allowedTools")
    for (const tool of params.allowedTools) {
      args.push(tool)
    }
    args.push("--dangerously-skip-permissions")
  }

  // Model selection
  if (params.model) {
    args.push("--model", params.model)
  }

  return new Promise((resolve, reject) => {
    const startTime = Date.now()

    const child = spawn("claude", args, {
      cwd: params.cwd,
      shell: process.platform === "win32", // Required on Windows for .cmd resolution
      env: { ...process.env }, // Inherit PATH
      stdio: ["pipe", "pipe", "pipe"], // stdin is pipe for prompt piping
    })

    let stdout = ""
    let stderr = ""

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    // Pipe prompt via stdin and close it
    child.stdin.write(params.prompt)
    child.stdin.end()

    // Timeout handling
    const timer = setTimeout(() => {
      child.kill("SIGTERM")
      reject(
        new Error(`Agent execution timed out after ${params.timeoutMs}ms`)
      )
    }, params.timeoutMs)

    child.on("error", (err) => {
      clearTimeout(timer)
      if (err.message.includes("ENOENT")) {
        reject(
          new Error(
            "Claude CLI not found. Ensure 'claude' is installed globally " +
              "and available in PATH."
          )
        )
      } else {
        reject(err)
      }
    })

    child.on("close", (code) => {
      clearTimeout(timer)
      const durationMs = Date.now() - startTime

      if (code !== 0) {
        reject(
          new Error(
            `Claude CLI exited with code ${code}: ${stderr || stdout.slice(0, 500)}`
          )
        )
        return
      }

      try {
        const json = JSON.parse(stdout)

        if (json.is_error === true) {
          reject(new Error(`Claude CLI error: ${json.result}`))
          return
        }

        resolve({
          output: json.structured_output ?? json.result,
          tokensIn: 0, // CLI does not expose token counts
          tokensOut: 0,
          costUsd: json.total_cost_usd ?? 0,
          durationMs: json.duration_ms ?? durationMs,
        })
      } catch (parseErr) {
        reject(
          new Error(
            `Failed to parse Claude CLI JSON output: ${(parseErr as Error).message}. ` +
              `Raw: ${stdout.slice(0, 500)}`
          )
        )
      }
    })
  })
}
