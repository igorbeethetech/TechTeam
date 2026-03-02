import { spawn, type ChildProcess } from "node:child_process"
import type { AgentExecutionParams, AgentExecutionResult } from "./base-agent.js"

/**
 * CLI executor for Claude MAX mode.
 * Spawns `claude` CLI subprocess with JSON output and returns AgentExecutionResult
 * matching the same interface as the SDK executor (executeAgent).
 *
 * Prompt is piped via stdin. The JSON schema is appended to the prompt text
 * as instructions (avoiding Windows command-line length limits).
 */
export async function executeAgentCli(
  params: AgentExecutionParams
): Promise<AgentExecutionResult> {
  // Build the full prompt: original prompt + schema instructions appended
  let fullPrompt = params.prompt
  if (params.schema) {
    fullPrompt += "\n\n---\nIMPORTANT: You MUST respond with valid JSON matching this exact schema. Output ONLY the JSON, no markdown fences, no explanation:\n" + JSON.stringify(params.schema, null, 2)
  }

  const args: string[] = [
    "-p", "-",
    "--output-format", "json",
    "--max-turns", String(params.maxTurns ?? 5),
    "--no-session-persistence",
  ]

  // Add system prompt
  if (params.systemPrompt) {
    args.push("--system-prompt", params.systemPrompt)
  }

  // Add allowed tools
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

  // Build env: remove CLAUDECODE (nested session check) and ANTHROPIC_API_KEY
  // (so CLI uses the Claude MAX subscription instead of API credits)
  const env = { ...process.env }
  delete env.CLAUDECODE
  delete env.ANTHROPIC_API_KEY

  return new Promise((resolve, reject) => {
    const startTime = Date.now()
    let resolved = false

    const child: ChildProcess = spawn("claude", args, {
      cwd: params.cwd,
      shell: process.platform === "win32",
      env,
      stdio: ["pipe", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""

    child.stdout!.on("data", (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr!.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    // Write prompt via stdin and close
    child.stdin!.write(fullPrompt, () => {
      child.stdin!.end()
    })

    // Timeout handling
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true
        child.kill("SIGTERM")
        reject(
          new Error(`Agent execution timed out after ${params.timeoutMs}ms`)
        )
      }
    }, params.timeoutMs)

    child.on("error", (err) => {
      if (resolved) return
      resolved = true
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
      if (resolved) return
      resolved = true
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

        // CLI with --output-format json returns {result, ...}
        // Try to parse the result as JSON if it's a string (structured output)
        let output = json.result
        if (typeof output === "string") {
          try {
            output = JSON.parse(output)
          } catch {
            // Not JSON, keep as-is
          }
        }

        resolve({
          output,
          tokensIn: 0,
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
