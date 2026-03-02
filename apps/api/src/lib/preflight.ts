import { spawn } from "node:child_process"
import { forTenant } from "@techteam/database"
import { config } from "./config.js"

export interface PreflightError {
  code: string
  message: string
}

export interface PreflightResult {
  ok: boolean
  errors: PreflightError[]
}

export interface ClaudeCliStatus {
  loggedIn: boolean
  email?: string
  subscriptionType?: string
}

/**
 * Runs `claude auth status --json` and parses the result.
 */
export async function getClaudeCliStatus(): Promise<ClaudeCliStatus> {
  return new Promise((resolve) => {
    const child = spawn("claude", ["auth", "status", "--json"], {
      shell: true,
      timeout: 10_000,
      env: { ...process.env, CLAUDECODE: undefined, ANTHROPIC_API_KEY: undefined },
    })

    let stdout = ""
    let stderr = ""

    child.stdout?.on("data", (data) => { stdout += data.toString() })
    child.stderr?.on("data", (data) => { stderr += data.toString() })

    child.on("error", () => {
      resolve({ loggedIn: false })
    })

    child.on("close", (code) => {
      try {
        const output = stdout.trim() || stderr.trim()
        const parsed = JSON.parse(output)
        resolve({
          loggedIn: !!parsed.loggedIn,
          email: parsed.email ?? parsed.account ?? undefined,
          subscriptionType: parsed.subscriptionType ?? parsed.plan ?? undefined,
        })
      } catch {
        // If output contains "logged in" text, treat as logged in
        const combined = (stdout + stderr).toLowerCase()
        if (combined.includes("logged in") && !combined.includes("not logged in")) {
          resolve({ loggedIn: true })
        } else {
          resolve({ loggedIn: false })
        }
      }
    })
  })
}

/**
 * Validates all prerequisites before starting the agent pipeline.
 */
export async function validatePreflight(tenantId: string): Promise<PreflightResult> {
  const errors: PreflightError[] = []

  const db = forTenant(tenantId)
  const settings = await (db as any).tenantSettings.findFirst()

  // Check GitHub token
  const hasGithubToken = !!settings?.githubToken || !!config.GITHUB_TOKEN
  if (!hasGithubToken) {
    errors.push({
      code: "missing_github_token",
      message: "Configure seu token GitHub para iniciar processos",
    })
  }

  const mode = settings?.agentExecutionMode ?? "sdk"

  if (mode === "sdk") {
    // Check Anthropic API key
    const hasAnthropicKey = !!settings?.anthropicApiKey || !!config.ANTHROPIC_API_KEY
    if (!hasAnthropicKey) {
      errors.push({
        code: "missing_anthropic_key",
        message: "Configure sua chave Anthropic API para usar o modo SDK",
      })
    }
  } else {
    // CLI mode: check claude auth status
    const cliStatus = await getClaudeCliStatus()
    if (!cliStatus.loggedIn) {
      errors.push({
        code: "cli_not_authenticated",
        message: "Autentique o Claude CLI para usar o modo Claude MAX",
      })
    }
  }

  return { ok: errors.length === 0, errors }
}
