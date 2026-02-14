# Phase 9: Claude MAX Integration - Research

**Researched:** 2026-02-14
**Domain:** Claude CLI subprocess integration, agent execution mode switching, Node.js child_process
**Confidence:** HIGH

## Summary

This phase adds an alternative agent execution mode that uses the Claude Code CLI (`claude -p`) subprocess instead of the Anthropic Agent SDK. Users with a Claude MAX subscription get unlimited usage through the CLI, bypassing per-API-call costs. The implementation requires: (1) a new `agentExecutionMode` field on TenantSettings (Prisma migration), (2) a toggle on the Settings page, (3) a CLI executor function (`executeAgentCli`) that mirrors the SDK's `executeAgent` interface, and (4) a routing layer in each agent that picks SDK vs CLI based on tenant config.

The Claude CLI supports headless mode via `claude -p "prompt" --output-format json --json-schema '{...}'` which returns structured JSON with metadata including `result`, `structured_output`, `total_cost_usd`, `duration_ms`, `session_id`, and `is_error` fields. This maps directly to the existing `AgentExecutionResult` interface. The key challenge is that the CLI does NOT return token counts (`tokensIn`/`tokensOut`) -- only `total_cost_usd` (which will be 0 for MAX users) and `duration_ms`.

The existing agent architecture (base-agent.ts -> individual agents -> agent.worker.ts) is clean and well-factored, making it straightforward to introduce CLI execution as an alternative path. Each agent already builds a prompt string and JSON schema independently, which maps directly to the CLI's `--json-schema` and `-p` flags.

**Primary recommendation:** Create a single `executeAgentCli` function in `apps/api/src/agents/base-agent-cli.ts` that spawns `claude -p` with `child_process.spawn`, parses the JSON output, and returns `AgentExecutionResult`. Each agent file stays untouched -- the routing happens in a new `executeAgentAuto` wrapper that checks TenantSettings.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js `child_process` | built-in | Spawn CLI subprocess | Native, no dependencies needed |
| `zod-to-json-schema` | already in project | Convert Zod schemas to JSON Schema for `--json-schema` flag | Already used by all agents |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Prisma | already in project | Add `agentExecutionMode` to TenantSettings | Schema migration for new field |
| `@techteam/shared` | already in project | Agent output schemas (Zod) | Schema validation of CLI output |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `child_process.spawn` | `child_process.exec` | exec buffers entire stdout in memory, risky for large outputs; spawn streams |
| `child_process.spawn` | `execa` (npm) | Nicer API but unnecessary dependency; spawn is sufficient for this use case |

**Installation:**
```bash
# No new packages needed -- all dependencies already exist in the project
```

## Architecture Patterns

### Recommended Project Structure
```
apps/api/src/agents/
  base-agent.ts          # Existing SDK executor (unchanged)
  base-agent-cli.ts      # NEW: CLI executor (mirrors base-agent interface)
  agent-router.ts        # NEW: Routes to SDK or CLI based on tenant config
  discovery.agent.ts     # Existing (unchanged)
  planning.agent.ts      # Existing (unchanged)
  development.agent.ts   # Existing (unchanged)
  testing.agent.ts       # Existing (unchanged)
  merge-resolver.agent.ts # Existing (unchanged)
```

### Pattern 1: CLI Executor (base-agent-cli.ts)
**What:** A function that spawns `claude -p` with the same interface as `executeAgent`
**When to use:** When tenant has `agentExecutionMode === "cli"`
**Example:**
```typescript
// Source: Official Claude CLI docs (code.claude.com/docs/en/headless)
import { spawn } from "node:child_process"
import type { AgentExecutionParams, AgentExecutionResult } from "./base-agent.js"

export async function executeAgentCli(
  params: AgentExecutionParams
): Promise<AgentExecutionResult> {
  const args: string[] = [
    "-p", params.prompt,
    "--output-format", "json",
    "--max-turns", String(params.maxTurns ?? 5),
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

  // Add allowed tools
  if (params.allowedTools && params.allowedTools.length > 0) {
    args.push("--allowedTools", params.allowedTools.join(","))
    args.push("--dangerously-skip-permissions")
  } else {
    // No tools -- disable all
    args.push("--tools", "")
  }

  // Model selection
  if (params.model) {
    args.push("--model", params.model)
  }

  return new Promise((resolve, reject) => {
    const startTime = Date.now()
    const child = spawn("claude", args, {
      cwd: params.cwd,
      shell: process.platform === "win32",  // Required on Windows
      env: { ...process.env },              // Inherit PATH
      stdio: ["ignore", "pipe", "pipe"],    // stdin ignored for -p mode
    })

    let stdout = ""
    let stderr = ""

    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString() })

    // Timeout handling
    const timer = setTimeout(() => {
      child.kill("SIGTERM")
      reject(new Error(`Agent execution timed out after ${params.timeoutMs}ms`))
    }, params.timeoutMs)

    child.on("error", (err) => {
      clearTimeout(timer)
      if (err.message.includes("ENOENT")) {
        reject(new Error(
          "Claude CLI not found. Ensure 'claude' is installed globally " +
          "(npm install -g @anthropic-ai/claude-code) and available in PATH."
        ))
      } else {
        reject(err)
      }
    })

    child.on("close", (code) => {
      clearTimeout(timer)
      const durationMs = Date.now() - startTime

      if (code !== 0) {
        reject(new Error(
          `Claude CLI exited with code ${code}: ${stderr || stdout}`
        ))
        return
      }

      try {
        const json = JSON.parse(stdout)

        if (json.is_error) {
          reject(new Error(`Claude CLI error: ${json.result}`))
          return
        }

        resolve({
          output: json.structured_output ?? json.result,
          tokensIn: 0,   // CLI does not expose token counts
          tokensOut: 0,
          costUsd: json.total_cost_usd ?? 0,
          durationMs: json.duration_ms ?? durationMs,
        })
      } catch (parseErr) {
        reject(new Error(
          `Failed to parse Claude CLI JSON output: ${(parseErr as Error).message}. Raw: ${stdout.slice(0, 500)}`
        ))
      }
    })
  })
}
```

### Pattern 2: Agent Router
**What:** A wrapper that checks tenant config and dispatches to SDK or CLI executor
**When to use:** Called by each agent instead of calling `executeAgent` directly
**Example:**
```typescript
// apps/api/src/agents/agent-router.ts
import { executeAgent, type AgentExecutionParams, type AgentExecutionResult } from "./base-agent.js"
import { executeAgentCli } from "./base-agent-cli.js"
import { prisma } from "@techteam/database"

export async function executeAgentAuto(
  tenantId: string,
  params: AgentExecutionParams
): Promise<AgentExecutionResult> {
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId },
  })

  const mode = settings?.agentExecutionMode ?? "sdk"

  if (mode === "cli") {
    return executeAgentCli(params)
  }

  return executeAgent(params)
}
```

### Pattern 3: TenantSettings Schema Extension
**What:** Add `agentExecutionMode` enum field to TenantSettings
**Example Prisma migration:**
```prisma
// In schema.prisma
enum AgentExecutionMode {
  sdk  // Default: use Anthropic SDK with API key
  cli  // Claude MAX: use claude -p CLI subprocess
}

model TenantSettings {
  id                 String             @id @default(cuid())
  tenantId           String             @unique
  githubToken        String?
  anthropicApiKey    String?
  agentExecutionMode AgentExecutionMode @default(sdk)
  createdAt          DateTime           @default(now())
  updatedAt          DateTime           @updatedAt

  @@index([tenantId])
}
```

### Pattern 4: Settings Page Toggle
**What:** Radio button or toggle switch on the Settings page to switch between modes
**Example:**
```tsx
// Simplified -- add to existing Settings page
<Card>
  <CardHeader>
    <CardTitle>Agent Execution Mode</CardTitle>
  </CardHeader>
  <CardContent>
    <RadioGroup
      value={mode}
      onValueChange={setMode}
    >
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="sdk" id="sdk" />
        <Label htmlFor="sdk">
          API Key (pay per use)
        </Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="cli" id="cli" />
        <Label htmlFor="cli">
          Claude MAX (unlimited via CLI)
        </Label>
      </div>
    </RadioGroup>
    <p className="text-sm text-muted-foreground mt-2">
      Claude MAX requires the Claude CLI installed on the server.
    </p>
  </CardContent>
</Card>
```

### Anti-Patterns to Avoid
- **Duplicating agent prompt logic:** Do NOT copy prompt-building code into CLI-specific agents. The prompt builders in each agent file already produce strings -- reuse them.
- **Parsing CLI text output:** Always use `--output-format json` with `--json-schema`. Never try to parse the plain text output of the CLI.
- **Hardcoding the `claude` path:** Use PATH resolution (just `"claude"` as the command). On Windows, set `shell: true` to resolve `.cmd` wrappers.
- **Blocking on large stdout:** Use `spawn` with streaming stdout, not `exec` which buffers everything in memory.
- **Forgetting to propagate environment:** Always pass `env: { ...process.env }` to the child process so it inherits PATH, HOME, and other required env vars.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON Schema from Zod | Manual JSON Schema construction | `zod-to-json-schema` (already used) | Ensures schemas stay in sync with Zod types |
| Process management | Custom process pool/manager | Node.js `child_process.spawn` | Built-in, battle-tested, handles signals correctly |
| Timeout handling | Manual timers with kill logic | `AbortSignal.timeout` or `setTimeout` + `child.kill` | Standard pattern, already used in base-agent.ts |
| Schema validation | Manual JSON parsing + checking | Zod `.parse()` on CLI structured_output | Already the pattern for all agents |

**Key insight:** The CLI executor should be a thin wrapper -- the existing agent architecture (prompt builders + Zod schemas + worker orchestration) stays entirely intact. The only new code is the spawn-and-parse layer.

## Common Pitfalls

### Pitfall 1: ENOENT Spawn Error on Windows
**What goes wrong:** `spawn("claude", ...)` throws `Error: spawn claude ENOENT` on Windows because `claude` is a `.cmd` batch file, not an `.exe`.
**Why it happens:** Node.js `spawn` on Windows does not invoke a shell by default, so it cannot resolve `.cmd` files.
**How to avoid:** Set `shell: true` on Windows: `spawn("claude", args, { shell: process.platform === "win32" })`
**Warning signs:** Works in development (where shell is often implicit), fails in production.

### Pitfall 2: ENOENT Spawn Error in Docker Containers
**What goes wrong:** The Claude CLI is not in PATH inside Docker containers, or the SDK's internal spawn mechanism fails.
**Why it happens:** Docker containers have minimal environments. Claude CLI must be explicitly installed and PATH must include its location.
**How to avoid:** In Docker: `RUN npm install -g @anthropic-ai/claude-code` and verify PATH includes the npm global bin directory. This is a Phase 10 concern (Docker deployment) but should be flagged now.
**Warning signs:** Works locally, fails in Docker.

### Pitfall 3: Missing Token Usage Data
**What goes wrong:** The CLI's JSON output does NOT include `tokensIn`/`tokensOut` fields. If the planner assumes these are available, metrics will be wrong.
**Why it happens:** The CLI only exposes `total_cost_usd`, `duration_ms`, `num_turns`, and `is_error` -- no per-request token breakdowns.
**How to avoid:** Set `tokensIn: 0, tokensOut: 0` for CLI mode. For MAX users, cost is always 0 anyway, so token tracking is informational only. Document this limitation clearly.
**Warning signs:** Demand `totalTokens` stays at 0 for CLI-mode runs.

### Pitfall 4: Prompt Length Exceeds Command-Line Limits
**What goes wrong:** Very long prompts (especially for development agent with full plan + requirements JSON) can exceed the OS command-line argument length limit (~32K on Windows, ~2MB on Linux).
**Why it happens:** The prompt is passed as a CLI argument to `-p`.
**How to avoid:** Pipe the prompt via stdin instead of as a command argument. The CLI supports `cat prompt.txt | claude -p --output-format json`. In Node.js, write to `child.stdin` and close it.
**Warning signs:** Works for discovery (short prompts), fails for development (long prompts with plan JSON).

### Pitfall 5: CLI Auth Without API Key
**What goes wrong:** The Claude CLI by default uses the user's Claude account (MAX subscription). If the CLI is not authenticated, it fails.
**Why it happens:** Claude MAX mode relies on the CLI being logged in on the server (`claude login`). There is no API key to pass.
**How to avoid:** Document that the server must have `claude` CLI authenticated before switching to CLI mode. Add a validation step when the user switches to CLI mode that spawns `claude --version` or a simple health check.
**Warning signs:** "Not authenticated" errors on first CLI run.

### Pitfall 6: allowedTools Format Mismatch
**What goes wrong:** The SDK uses `allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"]` while the CLI uses `--allowedTools "Read" "Write" ...` as separate args or comma-separated.
**Why it happens:** Different invocation interfaces between SDK and CLI.
**How to avoid:** In the CLI executor, join tools with commas or pass as separate `--allowedTools` arguments. Verify the exact CLI format.
**Warning signs:** Tools not available during CLI agent execution.

### Pitfall 7: Concurrent CLI Processes Exhausting Resources
**What goes wrong:** BullMQ worker has `concurrency: 2`, meaning 2 CLI processes can run simultaneously. Each Claude CLI process uses significant memory and CPU.
**Why it happens:** CLI mode spawns a full Claude Code process (Node.js + headless mode) per agent run.
**How to avoid:** Keep existing BullMQ concurrency limits. Monitor server memory. Consider reducing concurrency to 1 for CLI mode if resource-constrained.
**Warning signs:** Server OOM kills, slow agent execution.

## Code Examples

### CLI JSON Output Structure
```json
// Source: Official Claude CLI docs + verified via introl.com blog
// Response from: claude -p "prompt" --output-format json --json-schema '{...}'
{
  "type": "result",
  "subtype": "success",
  "total_cost_usd": 0.0034,
  "is_error": false,
  "duration_ms": 2847,
  "duration_api_ms": 1923,
  "num_turns": 4,
  "result": "Text response here (used when no --json-schema)",
  "structured_output": { /* matches the provided JSON Schema */ },
  "session_id": "abc-123-def"
}
```

### Piping Prompt via stdin (for long prompts)
```typescript
// Source: Node.js child_process docs + Claude CLI stdin support
import { spawn } from "node:child_process"

function executeWithStdin(prompt: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", args, {
      shell: process.platform === "win32",
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],  // stdin is pipe, not ignore
    })

    let stdout = ""
    let stderr = ""

    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString() })

    // Write prompt to stdin and close it
    child.stdin.write(prompt)
    child.stdin.end()

    child.on("close", (code) => {
      if (code !== 0) reject(new Error(`Exit ${code}: ${stderr}`))
      else resolve(stdout)
    })

    child.on("error", reject)
  })
}
```

### Settings API Extension
```typescript
// apps/api/src/routes/settings.ts -- additions to existing PUT handler
// Add agentExecutionMode to the body type:
const body = request.body as {
  githubToken?: string | null
  anthropicApiKey?: string | null
  agentExecutionMode?: "sdk" | "cli"
}

// Add to data object:
if (body.agentExecutionMode !== undefined) {
  data.agentExecutionMode = body.agentExecutionMode
}

// Add to GET response:
return {
  settings: {
    ...existingFields,
    agentExecutionMode: settings.agentExecutionMode ?? "sdk",
  },
}
```

### Schema Migration
```sql
-- Prisma-generated migration (conceptual)
-- CreateEnum
CREATE TYPE "AgentExecutionMode" AS ENUM ('sdk', 'cli');

-- AlterTable
ALTER TABLE "TenantSettings" ADD COLUMN "agentExecutionMode" "AgentExecutionMode" NOT NULL DEFAULT 'sdk';
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Claude CLI headless mode | Agent SDK (TypeScript/Python) | 2025 | SDK provides native message streaming, but CLI still works for headless execution |
| `--output-format` only | `--output-format json` + `--json-schema` | 2025 | Structured output with constrained decoding via CLI |
| Permission prompts block CI | `--dangerously-skip-permissions` flag | 2025 | Enables fully headless execution without interactive permission prompts |

**Deprecated/outdated:**
- The `output_format` parameter in the API has been moved to `output_config.format` -- but this is API-level, not CLI-level. The CLI's `--output-format` flag is current and stable.

## Open Questions

1. **CLI Authentication in Production (Docker)**
   - What we know: Claude MAX requires the CLI to be authenticated via `claude login` on the server. This stores credentials in `~/.claude/`.
   - What's unclear: How to persist CLI auth in Docker containers (volume mount for `~/.claude/`? Environment variable?). This is more of a Phase 10 concern.
   - Recommendation: For Phase 9, assume the CLI is authenticated on the dev server. Document the Docker auth requirement for Phase 10.

2. **Token Usage Tracking for CLI Mode**
   - What we know: The CLI JSON output does NOT include `tokensIn`/`tokensOut`. It only includes `total_cost_usd` (0 for MAX) and `duration_ms`.
   - What's unclear: Whether future CLI versions will expose token counts.
   - Recommendation: Set tokens to 0 for CLI mode. Add a note to the AgentRun record indicating CLI mode was used. Duration and cost ($0) are still tracked.

3. **allowedTools CLI Flag Format**
   - What we know: The SDK uses an array of tool names. The CLI uses `--allowedTools` with tool names. The CLI reference shows them as separate quoted arguments: `--allowedTools "Bash(git log *)" "Bash(git diff *)" "Read"`.
   - What's unclear: Whether comma-separated also works, or if each tool must be a separate argument.
   - Recommendation: Pass each tool as a separate argument after `--allowedTools` to match the documented pattern.

4. **Prompt Size Limits**
   - What we know: Windows has ~32K character command-line limit. Development agent prompts can be very large (plan + requirements JSON).
   - What's unclear: The exact safe limit and whether piping via stdin is fully supported for `-p` mode.
   - Recommendation: Use stdin piping (`cat | claude -p`) for all prompts to avoid any size limits. The official docs show `cat file | claude -p "query"` as a supported pattern.

## Sources

### Primary (HIGH confidence)
- [Claude CLI Reference](https://code.claude.com/docs/en/cli-reference) - Complete flag reference, verified `--output-format`, `--json-schema`, `--max-turns`, `--system-prompt`, `--allowedTools`, `--dangerously-skip-permissions`, `--no-session-persistence`
- [Claude CLI Headless Mode](https://code.claude.com/docs/en/headless) - Official headless mode documentation, `-p` flag usage, structured output patterns, stdin piping
- [Node.js child_process docs](https://nodejs.org/api/child_process.html) - spawn, exec, stdio configuration, error events

### Secondary (MEDIUM confidence)
- [Introl Blog - CLI Technical Reference](https://introl.com/blog/claude-code-cli-comprehensive-guide-2025) - JSON output schema fields (`type`, `subtype`, `total_cost_usd`, `is_error`, `duration_ms`, `duration_api_ms`, `num_turns`, `result`, `session_id`), verified against official docs
- [GitHub Issue #4383](https://github.com/anthropics/claude-code/issues/4383) - Docker ENOENT issues, workarounds (explicit PATH passing, stdio config)
- [Windows ENOENT Fix](https://fransiscuss.com/2025/04/22/fix-spawn-npx-enoent-windows11-mcp-server/) - Windows `shell: true` requirement for .cmd files

### Tertiary (LOW confidence)
- Token usage exposure in CLI output -- based on GitHub issues (#8861, #11535) requesting this feature, suggesting it's NOT currently available. Needs validation during implementation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new libraries needed; all existing tooling applies
- Architecture: HIGH - Clean separation in existing code makes the routing pattern straightforward. Verified CLI flags against official docs.
- Pitfalls: HIGH - ENOENT issues well-documented in multiple GitHub issues; token limitation confirmed via multiple sources; prompt size limits are standard Node.js/OS knowledge
- CLI output schema: MEDIUM - JSON fields verified via blog + official docs examples, but `structured_output` field specifically needs validation during implementation

**Research date:** 2026-02-14
**Valid until:** 2026-03-14 (Claude CLI is actively evolving; verify flags if implementing later)
