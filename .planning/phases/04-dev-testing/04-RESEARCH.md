# Phase 4: Development and Testing - Research

**Researched:** 2026-02-12
**Domain:** Claude Agent SDK with file/bash tools, Git branch management, GitHub PR creation, automated code review and testing, agent feedback loops
**Confidence:** HIGH

## Summary

Phase 4 transforms the TechTeam pipeline from planning artifacts into actual code generation. It requires two new agents -- Development and Testing -- that fundamentally differ from Discovery and Planning agents in Phase 3. While Discovery and Planning were "thinking-only" agents (structured output, no tools, `tools: []`), the Development agent needs full filesystem access (`Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`) to read the codebase, write code, and run commands in the project's repository. The Testing agent needs read access to review code and `Bash` to execute project tests.

The architecture divides into three concerns: (1) **Git orchestration** -- the worker (not the agent) handles branch creation, pushing, and PR creation using `simple-git` for git operations and `@octokit/rest` for GitHub API calls, maintaining the "pure agent function" pattern where agents return results and workers handle side effects; (2) **Development agent** -- invoked via the Claude Agent SDK with `tools: { type: 'preset', preset: 'claude_code' }` and `permissionMode: 'bypassPermissions'`, receiving the planning output as its prompt and executing code changes in the project's `repoPath` with a `cwd` set to the project directory; (3) **Testing agent** -- a hybrid approach using the Claude Agent SDK with limited tools (`Read`, `Glob`, `Grep`, `Bash`) to review the diff, run tests, and produce a structured approval/rejection report.

The critical architectural decision is that **git operations are worker-side effects, not agent responsibilities**. The worker creates the branch before invoking the development agent, and creates the PR after the agent completes. This keeps agents pure (they just write code / review code), maintains the existing pattern where workers handle all DB writes and stage advancement, and prevents agents from making uncontrolled git operations. The agent's `Bash` tool still allows it to run project commands (npm install, build, etc.) but the worker controls the git workflow.

**Primary recommendation:** Use `simple-git` (v3.30.x) for programmatic git operations in the worker, `@octokit/rest` (v22.x) for GitHub PR creation, Claude Agent SDK with `claude_code` tools preset for the Development agent (30min timeout, `maxTurns: 50`), and Claude Agent SDK with restricted read-only + Bash tools for the Testing agent (10min timeout). Worker orchestrates the full flow: create branch, run dev agent, commit, push, create PR, run test agent, handle approval/rejection.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @anthropic-ai/claude-agent-sdk | ^0.2.39 (already installed) | Agent execution with file/bash tools for code generation and review | Already used in Phase 3. Now configured with tools enabled instead of `tools: []`. Provides Read, Write, Edit, Bash, Glob, Grep built-in. |
| simple-git | ^3.30.0 | Programmatic git operations (branch, checkout, add, commit, push, pull) | Industry standard for Node.js git operations. 3.8k GitHub stars, TypeScript-native since v3, async/await API, lightweight wrapper around git CLI. Used in production by major tools. |
| @octokit/rest | ^22.0.0 | GitHub REST API client for PR creation and management | Official GitHub SDK for JavaScript. Fully typed TypeScript, covers all GitHub API endpoints. `octokit.rest.pulls.create()` for PR creation. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| bullmq | ^5.68.0 (already installed) | Job queue -- extended with development/testing phases | Already in stack. Queue type extended to include `development` and `testing` phases. |
| zod | ^3.25.76 (already installed) | Output schemas for development and testing agent results | Testing agent needs structured output (approval/rejection report). Development agent may use structured output for commit summaries. |
| zod-to-json-schema | ^3.25.1 (already installed) | Convert Zod schemas to JSON Schema for SDK outputFormat | Same pattern as Discovery/Planning agents. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| simple-git | child_process.exec('git ...') | Raw exec works but requires manual output parsing, error handling, and escaping. simple-git provides typed results, proper error types, and chainable API. |
| simple-git | isomorphic-git | isomorphic-git is pure JS (no git binary needed) but much slower for large repos, less feature-complete, and the project has lower maintenance activity. simple-git wraps the real git CLI which handles all edge cases. |
| @octokit/rest | gh CLI via child_process | gh CLI requires installation on the server, adds a runtime dependency, and requires parsing stdout. @octokit/rest is a pure npm package with typed responses. Also, gh is not installed on the current dev machine. |
| @octokit/rest | GitHub REST API via fetch | Manual API calls require handling auth headers, pagination, error codes manually. Octokit wraps all of this with proper TypeScript types. |
| Worker-managed git | Agent-managed git (agent runs git commands) | Letting the agent run git directly via Bash is simpler but violates the pure agent function pattern, makes error recovery harder, and risks uncontrolled git operations (wrong branch, force pushes, etc.). Worker-managed git keeps agents focused on code, worker controls workflow. |
| claude_code tools preset | Explicit allowedTools list | The preset gives all Claude Code tools. Using `allowedTools` explicitly (`['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep']`) is more restrictive and prevents unneeded tools (WebSearch, WebFetch, etc.). Explicit list is recommended for tighter control. |

**Installation:**
```bash
cd apps/api && pnpm add simple-git @octokit/rest
```

## Architecture Patterns

### Recommended Project Structure

```
apps/api/
  src/
    agents/
      base-agent.ts              # EXISTING: Extended to support tools config
      discovery.agent.ts         # EXISTING: Unchanged
      planning.agent.ts          # EXISTING: Unchanged
      development.agent.ts       # NEW: Development phase agent (code generation)
      testing.agent.ts           # NEW: Testing phase agent (PR review + tests)
    queues/
      agent.queue.ts             # MODIFIED: Phase type extended with development/testing
      agent.worker.ts            # MODIFIED: Development/testing phase handling
    lib/
      git.ts                     # NEW: Git operations wrapper (simple-git)
      github.ts                  # NEW: GitHub API wrapper (octokit, PR creation)
      config.ts                  # MODIFIED: Add GITHUB_TOKEN env var
    routes/
      demands.ts                 # EXISTING: Unchanged
      agent-runs.ts              # EXISTING: Unchanged
packages/shared/
  src/
    schemas/
      agent.ts                   # MODIFIED: Add development/testing output schemas
    types/
      index.ts                   # MODIFIED: Add development/testing types
```

### Pattern 1: Worker-Orchestrated Git Workflow (Development Phase)

**What:** The worker handles the complete git workflow around the development agent: create branch -> invoke agent -> commit changes -> push -> create PR. The agent only writes code.

**When to use:** Every development phase execution.

**Example:**
```typescript
// apps/api/src/queues/agent.worker.ts - development phase handler
async function handleDevelopmentPhase(
  job: Job<AgentJobData>,
  prisma: TenantPrismaClient
) {
  const { demandId, projectId, tenantId } = job.data

  // 1. Fetch demand (with plan) and project
  const demand = await prisma.demand.findUniqueOrThrow({ where: { id: demandId } })
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } })

  // 2. Create branch name from demand
  const slug = demand.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)
  const branchName = `demand/${demand.id}-${slug}`

  // 3. Git: create and checkout isolated branch
  const git = createGitClient(project.repoPath)
  await git.fetch('origin', project.defaultBranch)
  await git.checkoutBranch(branchName, `origin/${project.defaultBranch}`)

  // 4. Store branchName on demand
  await prisma.demand.update({
    where: { id: demandId },
    data: { branchName }
  })

  // 5. Invoke development agent (writes code in repoPath)
  const agentResult = await runDevelopmentAgent({
    demandId, tenantId, projectId,
    timeout: 30 * 60 * 1000 // 30 minutes
  })

  // 6. Git: add all changes, commit with summary
  await git.add('.')
  await git.commit(`feat(demand/${demand.id}): ${agentResult.output.commitMessage}`)

  // 7. Git: push branch to remote
  await git.push('origin', branchName, ['--set-upstream'])

  // 8. GitHub: create PR
  const prUrl = await createPullRequest({
    owner: extractOwner(project.repoUrl),
    repo: extractRepo(project.repoUrl),
    title: `[Demand ${demand.id}] ${demand.title}`,
    body: buildPrBody(demand, agentResult.output),
    head: branchName,
    base: project.defaultBranch,
  })

  // 9. Store PR URL on demand, advance to testing
  await prisma.demand.update({
    where: { id: demandId },
    data: { prUrl, stage: 'testing', agentStatus: 'queued' }
  })

  // 10. Enqueue testing job
  await agentQueue.add('run-agent', {
    demandId, tenantId, projectId, phase: 'testing'
  })
}
```

### Pattern 2: Development Agent with Claude Code Tools

**What:** The development agent is invoked with file system tools enabled (`Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`) and `cwd` set to the project's repository path. The agent receives the planning output and executes code changes directly in the filesystem.

**When to use:** The core of development agent execution.

**Example:**
```typescript
// apps/api/src/agents/development.agent.ts
export async function runDevelopmentAgent(
  params: DevelopmentAgentParams
): Promise<DevelopmentAgentResult> {
  const { demandId, projectId, timeout } = params

  const demand = await prisma.demand.findUniqueOrThrow({ where: { id: demandId } })
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } })

  if (!demand.plan) {
    throw new Error('Cannot run development without a plan')
  }

  const prompt = buildDevelopmentPrompt(demand, project)

  // Development agent uses the Claude Agent SDK with tools ENABLED
  // Unlike Discovery/Planning which used tools: [] (no tools)
  const result = await executeAgentWithTools({
    prompt,
    timeoutMs: timeout,
    cwd: project.repoPath,  // Agent operates in the project's repo
    allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
    maxTurns: 50,  // Development needs many turns
    // Optionally use structured output for a summary
    schema: developmentOutputSchema
      ? zodToJsonSchema(developmentOutputSchema) as Record<string, unknown>
      : undefined,
  })

  return {
    output: result.output,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    costUsd: result.costUsd,
    durationMs: result.durationMs,
  }
}
```

### Pattern 3: Extended Base Agent for Tool-Enabled Execution

**What:** The existing `base-agent.ts` is extended (or a new variant created) that supports tools configuration, since the current implementation hardcodes `tools: []`.

**When to use:** Development and Testing agents need file system tools; Discovery/Planning do not.

**Example:**
```typescript
// apps/api/src/agents/base-agent.ts - extended signature
export interface AgentExecutionParams {
  prompt: string
  schema?: Record<string, unknown>  // Made optional for development agent
  timeoutMs: number
  cwd?: string
  // NEW fields for tool-enabled agents:
  allowedTools?: string[]           // e.g., ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep']
  maxTurns?: number                 // Override default 5
  systemPrompt?: string | { type: 'preset'; preset: 'claude_code'; append?: string }
}

export async function executeAgent(
  params: AgentExecutionParams
): Promise<AgentExecutionResult> {
  // ...existing timeout/abort logic...

  for await (const message of query({
    prompt: params.prompt,
    options: {
      abortController,
      model: config.CLAUDE_MODEL,
      maxTurns: params.maxTurns ?? 5,
      outputFormat: params.schema
        ? { type: 'json_schema', schema: params.schema }
        : undefined,
      cwd: params.cwd,
      allowedTools: params.allowedTools ?? [],  // Default: no tools
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      persistSession: false,
      systemPrompt: params.systemPrompt,
    },
  })) {
    if (message.type === 'result') {
      result = message
    }
  }

  // ...existing result handling...
}
```

### Pattern 4: Testing Agent with Limited Tools

**What:** The testing agent receives the PR diff, original plan, and requirements. It uses read-only tools plus Bash (for running tests) to produce a structured approval/rejection report.

**When to use:** Every testing phase execution.

**Example:**
```typescript
// apps/api/src/agents/testing.agent.ts
export async function runTestingAgent(
  params: TestingAgentParams
): Promise<TestingAgentResult> {
  const demand = await prisma.demand.findUniqueOrThrow({ where: { id: demandId } })
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } })

  // Testing agent gets: PR URL, plan, requirements, project context
  const prompt = buildTestingPrompt(demand, project)

  const jsonSchema = zodToJsonSchema(testingOutputSchema)

  const result = await executeAgent({
    prompt,
    schema: jsonSchema as Record<string, unknown>,
    timeoutMs: timeout,
    cwd: project.repoPath,
    allowedTools: ['Read', 'Glob', 'Grep', 'Bash'],  // No Write/Edit
    maxTurns: 20,
  })

  const output = testingOutputSchema.parse(result.output)

  return {
    output,
    approved: output.verdict === 'approved',
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    costUsd: result.costUsd,
    durationMs: result.durationMs,
  }
}
```

### Pattern 5: Rejection Feedback Loop

**What:** When testing rejects a PR, the demand returns to the development stage with the testing feedback attached. The development agent re-executes with the original plan PLUS the rejection reasons, targeting the specific issues raised.

**When to use:** When testing agent produces a rejection verdict.

**Example:**
```typescript
// In worker, after testing phase completes:
if (!testResult.approved) {
  // Store rejection feedback on demand
  await prisma.demand.update({
    where: { id: demandId },
    data: {
      stage: 'development',
      agentStatus: 'queued',
      // Store feedback in a JSON field for the next dev agent run
    }
  })

  // Store the testing output in AgentRun for history
  // Re-enqueue development job -- agent will see rejection feedback
  await agentQueue.add('run-agent', {
    demandId, tenantId, projectId, phase: 'development'
  })
}
```

### Pattern 6: Git Operations Wrapper

**What:** A centralized git utility module wrapping `simple-git` with project-specific configuration.

**When to use:** All git operations in the worker.

**Example:**
```typescript
// apps/api/src/lib/git.ts
import simpleGit, { SimpleGit } from 'simple-git'

export function createGitClient(repoPath: string): SimpleGit {
  return simpleGit(repoPath, {
    binary: 'git',
    maxConcurrentProcesses: 1,  // One git op at a time per repo
    trimmed: true,
  })
}

export async function createIsolatedBranch(
  repoPath: string,
  branchName: string,
  defaultBranch: string
): Promise<void> {
  const git = createGitClient(repoPath)
  await git.fetch('origin', defaultBranch)
  await git.checkout(`origin/${defaultBranch}`)
  await git.checkoutLocalBranch(branchName)
}

export async function commitAndPush(
  repoPath: string,
  branchName: string,
  commitMessage: string
): Promise<void> {
  const git = createGitClient(repoPath)
  const status = await git.status()
  if (status.files.length === 0) {
    throw new Error('No changes to commit -- development agent produced no code changes')
  }
  await git.add('.')
  await git.commit(commitMessage)
  await git.push('origin', branchName, ['--set-upstream'])
}
```

### Anti-Patterns to Avoid

- **Agent running git commands via Bash:** Do not let the Claude agent run `git checkout`, `git commit`, `git push` etc. directly. The worker should control the git workflow. The agent's Bash tool should be used for project-specific commands (npm install, build, test), not for git operations. Use a `systemPrompt` instruction telling the agent not to use git.
- **Single monolithic executeAgent function for all agents:** Discovery/Planning need `tools: []` and structured output. Development needs full tools and possibly no structured output. Testing needs limited tools and structured output. Parameterize the base agent or create separate execution functions.
- **Forgetting to checkout the branch before agent runs:** If the worker doesn't checkout the branch, the agent writes code on whatever branch is currently checked out (likely main), contaminating the default branch.
- **Not handling empty diffs:** The development agent might fail to produce any code changes. The worker must detect this (via `git status`) and handle it gracefully rather than creating an empty PR.
- **Unlimited maxTurns for development agent:** Without a turns limit, the agent could loop forever consuming tokens. Set `maxTurns: 50` as a reasonable upper bound for complex implementations.
- **Not setting maxBudgetUsd for development agent:** A 30-minute development agent can consume significant tokens. Consider setting `maxBudgetUsd` as a safety net.
- **Testing agent modifying code:** The testing agent should ONLY read and analyze. Giving it Write/Edit tools risks it "fixing" issues instead of reporting them, breaking the separation of concerns.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Git branch management | Raw `child_process.exec('git ...')` with string parsing | `simple-git` library | Typed results, proper error handling (GitError, TaskConfigurationError), async/await API, handles escaping and edge cases. |
| GitHub PR creation | Manual `fetch('https://api.github.com/...')` with auth headers | `@octokit/rest` `octokit.rest.pulls.create()` | Typed parameters and responses, automatic auth, pagination, rate limit handling, retry logic. |
| File system tools for AI agent | Custom MCP server or tool implementations | Claude Agent SDK built-in tools (`Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`) | The SDK already implements all file system operations with proper error handling, output formatting, and the agent loop. No need to implement custom tool execution. |
| Branch name sanitization | Custom regex replacement | Simple slug function + validation | Branch name must be `demand/{id}-{slug}` format. Keep slug generation simple: lowercase, replace non-alphanumeric with hyphens, truncate to 50 chars. |
| PR body generation | Manual string concatenation | Template function with plan summary, requirements summary, and demand context | Consistent PR body format across all demands. Include plan tasks, affected files, and testing criteria. |
| Retry logic for rejected PRs | Custom retry counter with state management | Use existing BullMQ retry mechanism + AgentRun attempt tracking | The existing retry infrastructure handles retries. Rejection is a new job (not a BullMQ retry), but the AgentRun model tracks attempt numbers. |

**Key insight:** The Claude Agent SDK provides the entire "AI writes code" capability out of the box via its built-in tools. The real implementation work is in the **orchestration layer** (worker git operations, PR creation, feedback loops) and **prompt engineering** (giving the agent the right context from the planning phase to produce good code).

## Common Pitfalls

### Pitfall 1: Agent Writes Code on Wrong Branch

**What goes wrong:** Development agent writes code on `main` instead of the feature branch.
**Why it happens:** Worker forgot to checkout the branch before invoking the agent, or a concurrent demand checked out a different branch on the same repo path.
**How to avoid:** Worker MUST checkout the branch before invoking the agent and verify the checkout succeeded. For CONC-04 (isolated branches), each concurrent demand should have its own working copy of the repo, OR enforce `maxConcurrentDev: 1` (which is the current default) so only one demand uses the repo path at a time.
**Warning signs:** PR contains unrelated changes, or commits appear on main branch.

### Pitfall 2: Development Agent Timeout Without Committing

**What goes wrong:** The 30-minute timeout fires, the agent is aborted, but it had already written partial code that is uncommitted.
**Why it happens:** Long-running agent exceeds timeout. The abort stops the agent but leaves dirty files in the working directory.
**How to avoid:** After timeout/error, the worker should check `git status` and either: (a) commit partial work with a "[WIP]" prefix, (b) reset the working directory with `git checkout .`, or (c) leave files and mark the demand as failed. Recommendation: reset on timeout, so the branch is clean for retry.
**Warning signs:** Subsequent development runs find uncommitted changes from previous runs.

### Pitfall 3: GitHub Token Permissions

**What goes wrong:** PR creation fails with 403/404 errors.
**Why it happens:** The `GITHUB_TOKEN` doesn't have sufficient permissions for the target repository.
**How to avoid:** The GitHub token needs `repo` scope (for private repos) or `public_repo` scope (for public repos). Document the required token permissions clearly. For GitHub Apps, the installation needs `pull_requests: write` and `contents: write` permissions.
**Warning signs:** Octokit throws "Resource not accessible by integration" or "Not Found" errors.

### Pitfall 4: Agent Produces No Changes

**What goes wrong:** Development agent completes successfully but `git status` shows no modified files.
**Why it happens:** Agent misunderstood the plan, couldn't find the right files, or only analyzed without actually editing. Can also happen if the agent ran commands (via Bash) that modified files outside the tracked directory.
**How to avoid:** After agent completes, check `git status`. If no changes, treat as a failure: update AgentRun with error "No code changes produced", set demand to failed. The prompt should explicitly instruct the agent to make file changes.
**Warning signs:** Empty PRs or PRs with only whitespace changes.

### Pitfall 5: Testing Agent Runs Tests That Don't Exist

**What goes wrong:** Testing agent tries to run `npm test` but the project has no test infrastructure configured.
**Why it happens:** Not all projects have tests set up. The testing agent should detect this and adapt.
**How to avoid:** The testing prompt should instruct the agent to first check if test infrastructure exists (`package.json` scripts, test directories, etc.) before running tests. If no tests exist, the agent should focus on code review against the plan/requirements instead.
**Warning signs:** Testing agent fails with "test script not found" or "no test specified" errors.

### Pitfall 6: Concurrent Development Conflicts on Same Repo Path

**What goes wrong:** Two demands simultaneously write to the same repo path, causing git conflicts or corrupted state.
**Why it happens:** `maxConcurrentDev > 1` for a project, but all demands share the same `repoPath`.
**How to avoid:** For v1 with `maxConcurrentDev: 1`, this is not an issue -- only one demand in development at a time per project. For future scaling (Phase 5, CONC-01/02), each concurrent demand needs its own working copy (git worktree or cloned directory). Phase 4 should enforce single-demand development per project.
**Warning signs:** Git errors about "index.lock exists", merge conflicts in unexpected places, corrupted `.git` directory.

### Pitfall 7: Rejection Loop Without Progress

**What goes wrong:** Testing keeps rejecting, Development keeps trying, creating an infinite loop consuming tokens.
**Why it happens:** The feedback from Testing doesn't address a fundamental issue (e.g., the plan itself is flawed, or the requirement is impossible with the current codebase).
**How to avoid:** Set a maximum rejection count (e.g., 3 rejections max). After max rejections, pause the demand with `agentStatus: 'paused'` and notify the user. Store the rejection count on the demand or derive from AgentRun records.
**Warning signs:** Same demand cycling between development and testing repeatedly, costs accumulating rapidly.

### Pitfall 8: File Checkpointing Limitations

**What goes wrong:** Agent makes changes via `Bash` (e.g., `echo > file.txt`, `sed -i`) that are not tracked by file checkpointing.
**Why it happens:** The SDK's file checkpointing only tracks changes made via Write, Edit, and NotebookEdit tools. Bash-based file modifications are invisible to the checkpoint system.
**How to avoid:** For Phase 4, do not rely on file checkpointing for recovery. Instead, use git as the checkpoint mechanism: the branch was created from the default branch, so `git checkout .` resets everything. If the agent needs to revert, the worker handles it via git.
**Warning signs:** Files modified by Bash commands persist after checkpoint rewind.

## Code Examples

Verified patterns from official sources:

### simple-git Branch Creation and Push

```typescript
// Source: https://github.com/steveukx/git-js README
import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git'

const options: Partial<SimpleGitOptions> = {
  baseDir: '/path/to/project',
  binary: 'git',
  maxConcurrentProcesses: 1,
  trimmed: true,
}

const git: SimpleGit = simpleGit(options)

// Create isolated branch from remote default branch
await git.fetch('origin', 'main')
await git.checkout(`origin/main`)
await git.checkoutLocalBranch('demand/abc123-my-feature')

// After agent writes code...
await git.add('.')
await git.commit('feat(demand/abc123): implement user authentication')
await git.push('origin', 'demand/abc123-my-feature', ['--set-upstream'])
```

### @octokit/rest PR Creation

```typescript
// Source: https://github.com/octokit/plugin-rest-endpoint-methods.js/blob/main/docs/pulls/create.md
import { Octokit } from '@octokit/rest'

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })

const { data: pr } = await octokit.rest.pulls.create({
  owner: 'igorbeethetech',
  repo: 'TechTeam',
  title: '[Demand abc123] Implement user authentication',
  body: [
    '## Summary',
    'Automated PR from TechTeam pipeline.',
    '',
    '## Plan Tasks',
    '- Task 1: Create auth middleware',
    '- Task 2: Add login endpoint',
    '',
    '## Requirements',
    '- FR-1: User can log in with email/password',
    '',
    '---',
    '_Generated by TechTeam Development Agent_',
  ].join('\n'),
  head: 'demand/abc123-my-feature',
  base: 'main',
})

console.log(`PR created: ${pr.html_url}`)
// pr.html_url is the PR URL to store on the demand
```

### Claude Agent SDK with Tools Enabled (Development Agent)

```typescript
// Source: https://platform.claude.com/docs/en/agent-sdk/typescript
import { query, type SDKResultMessage } from '@anthropic-ai/claude-agent-sdk'

const abortController = new AbortController()
const timer = setTimeout(() => abortController.abort(), 30 * 60 * 1000)

let result: SDKResultMessage | null = null

try {
  for await (const message of query({
    prompt: developmentPrompt,
    options: {
      abortController,
      model: 'sonnet',
      maxTurns: 50,
      cwd: '/path/to/project/repo',
      // Key difference from Discovery/Planning: TOOLS ENABLED
      allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      persistSession: false,
      // Optional: structured output for commit summary
      outputFormat: schema ? {
        type: 'json_schema',
        schema: developmentOutputJsonSchema,
      } : undefined,
    },
  })) {
    if (message.type === 'result') {
      result = message
    }
  }
} finally {
  clearTimeout(timer)
}
```

### Testing Agent with Structured Approval/Rejection Output

```typescript
// Testing agent output schema
const testingOutputSchema = z.object({
  verdict: z.enum(['approved', 'rejected']),
  summary: z.string(),
  testResults: z.object({
    testsRan: z.boolean(),
    testsPassed: z.boolean().optional(),
    testOutput: z.string().optional(),
  }),
  codeQuality: z.object({
    adheresToPlan: z.boolean(),
    adheresToRequirements: z.boolean(),
    issues: z.array(z.object({
      severity: z.enum(['critical', 'major', 'minor', 'suggestion']),
      file: z.string(),
      description: z.string(),
      suggestion: z.string().optional(),
    })),
  }),
  rejectionReasons: z.array(z.string()).optional(),
})
```

### Worker Development Phase Handler (Skeletal)

```typescript
// Extension of agent.worker.ts for development phase
if (phase === 'development') {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId }
  })

  // Determine if this is a fresh run or a retry after rejection
  const previousTestRuns = await prisma.agentRun.findMany({
    where: { demandId, phase: 'testing', status: 'completed' },
    orderBy: { createdAt: 'desc' },
  })
  const rejectionFeedback = previousTestRuns[0]?.output // Last testing output

  // Create branch (only on first attempt, not on rejection re-entry)
  if (!demand.branchName) {
    const branchName = generateBranchName(demand)
    await createIsolatedBranch(project.repoPath, branchName, project.defaultBranch)
    await prisma.demand.update({
      where: { id: demandId },
      data: { branchName }
    })
  } else {
    // Rejection re-entry: checkout existing branch
    const git = createGitClient(project.repoPath)
    await git.checkout(demand.branchName)
  }

  // Run development agent
  const agentResult = await runDevelopmentAgent({
    demandId, tenantId, projectId,
    timeout: PHASE_TIMEOUTS.development,
    rejectionFeedback,  // Pass previous test feedback if re-entry
  })

  // Commit and push
  await commitAndPush(
    project.repoPath,
    demand.branchName!,
    `feat(demand/${demand.id}): ${agentResult.output?.commitMessage ?? demand.title}`
  )

  // Create or update PR
  if (!demand.prUrl) {
    const prUrl = await createPullRequest({ ... })
    await prisma.demand.update({
      where: { id: demandId },
      data: { prUrl }
    })
  }
  // If PR already exists (re-entry), the push updates the existing PR

  // Advance to testing
  await prisma.demand.update({
    where: { id: demandId },
    data: { stage: 'testing', agentStatus: 'queued' }
  })
  await agentQueue.add('run-agent', {
    demandId, tenantId, projectId, phase: 'testing'
  })
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `tools: []` for all agents | Per-agent tool configuration via `allowedTools` | Agent SDK v0.2.x (2025) | Development agents now get full file system access while Discovery/Planning remain tool-less |
| `claude -p` headless mode for code generation | `@anthropic-ai/claude-agent-sdk` `query()` with built-in tools | Nov 2025 (SDK v0.1.x) | No child_process management, no stdout parsing, built-in tool execution |
| Manual file-change tracking | SDK `enableFileCheckpointing` with `rewindFiles()` | Jan 2026 (SDK v0.2.x) | Can rewind file changes made by Write/Edit tools (not Bash) -- useful for recovery but limited |
| `gh` CLI for PR creation | `@octokit/rest` npm package | Always available, official GitHub SDK | No CLI installation required, typed TypeScript API, works in any Node.js environment |
| node-git / libgit2 bindings | `simple-git` wrapping git CLI | simple-git v3 (2022) | TypeScript-native, async/await, wraps real git binary for full compatibility |

**Deprecated/outdated:**
- `tools: { type: 'preset', preset: 'claude_code' }`: While this works, it enables ALL Claude Code tools including WebSearch, WebFetch, Task, NotebookEdit, etc. For security and focus, use explicit `allowedTools` array instead.
- `isomorphic-git`: Pure JS git implementation is slower and less feature-complete than `simple-git` wrapping the real git binary. Only useful in browser environments.
- `node-gh` package: Deprecated in favor of the official `gh` CLI and `@octokit/rest`.

## Open Questions

1. **Git authentication for `simple-git` push operations**
   - What we know: `simple-git` wraps the git CLI. For push operations to GitHub, the worker needs authentication. Options: SSH key, HTTPS with personal access token (PAT), or GitHub App installation token.
   - What's unclear: Whether the server will use SSH keys (already configured in the dev environment) or HTTPS tokens. The `GITHUB_TOKEN` used by Octokit could also be used for git push via HTTPS URL rewriting.
   - Recommendation: For v1, assume SSH keys are configured on the server (standard dev setup). For production, use HTTPS with the same `GITHUB_TOKEN` via URL: `git remote set-url origin https://${GITHUB_TOKEN}@github.com/owner/repo.git`. Add a `configureGitAuth()` helper that sets this up.

2. **Development agent structured output vs free-form**
   - What we know: Discovery and Planning use structured JSON output (Zod schemas). Development agent primarily writes code (files), so structured output is less natural.
   - What's unclear: Whether the development agent should also produce a structured summary (commit message, files changed, approach taken) or just write code and let the worker derive this from git status.
   - Recommendation: Use structured output for a minimal summary: `{ commitMessage: string, filesChanged: string[], approach: string }`. The agent writes code via tools AND produces this summary at the end. If structured output fails (schema too complex for the agent after writing lots of code), fall back to a simple commit message from the demand title.

3. **Testing agent checkout strategy**
   - What we know: The testing agent needs to review the code on the demand's branch. The agent has `Read`, `Glob`, `Grep`, `Bash` tools with `cwd` set to `project.repoPath`.
   - What's unclear: Whether the worker should checkout the demand branch before running the testing agent, or if the testing agent should review the diff from the PR (via GitHub API).
   - Recommendation: Worker checks out the demand branch before running the testing agent. This way the agent can read the actual code, run tests, and compare against the plan. The diff can be included in the prompt (from git diff against default branch).

4. **Maximum rejection count before pausing**
   - What we know: The feedback loop cycles between Development and Testing. Each cycle costs tokens.
   - What's unclear: What is a reasonable maximum rejection count?
   - Recommendation: Default to 3 maximum rejection cycles. After 3 rejections, pause the demand with `agentStatus: 'paused'` and a clear message about accumulated issues. The user can manually review and either adjust the plan or restart development. Store rejection count on the demand or count from AgentRun records.

5. **Development agent model choice**
   - What we know: Discovery and Planning use configurable model (`CLAUDE_MODEL`, defaulting to `sonnet`). Development is a code generation task that benefits from higher capability models.
   - What's unclear: Whether Sonnet is sufficient for code generation or if Opus should be the default for development.
   - Recommendation: Add `CLAUDE_DEV_MODEL` env var (defaults to same as `CLAUDE_MODEL`). This allows running a higher-capability model for development while keeping cheaper models for other phases. In practice, start with the same model and upgrade if code quality is insufficient.

6. **Handling the `repoPath` for the agent's `cwd`**
   - What we know: `project.repoPath` stores the path where the project repo is cloned. The agent needs `cwd` set to this path.
   - What's unclear: Whether `repoPath` is always an absolute path and always exists. What happens if the repo isn't cloned yet.
   - Recommendation: The worker should validate that `repoPath` exists and is a git repository before starting the development phase. If not, fail early with a clear error. Repo cloning is a prerequisite that should be documented as part of project setup.

## Sources

### Primary (HIGH confidence)
- [Claude Agent SDK - TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript) - Complete Options type, tools configuration, allowedTools, permissionMode, built-in tool types (Read, Write, Edit, Bash, Glob, Grep)
- [Claude Agent SDK - Overview](https://platform.claude.com/docs/en/agent-sdk/overview) - Agent design patterns, tool presets, subagents, permissions
- [Claude Agent SDK - File Checkpointing](https://platform.claude.com/docs/en/agent-sdk/file-checkpointing) - enableFileCheckpointing, rewindFiles(), checkpoint UUIDs, limitations (Bash changes not tracked)
- [simple-git GitHub](https://github.com/steveukx/git-js) - API methods, TypeScript support, configuration options
- [Octokit REST.js - pulls.create](https://github.com/octokit/plugin-rest-endpoint-methods.js/blob/main/docs/pulls/create.md) - PR creation parameters (owner, repo, title, body, head, base)

### Secondary (MEDIUM confidence)
- [simple-git npm](https://www.npmjs.com/package/simple-git) - v3.30.0 latest version confirmed, 3.8k GitHub stars
- [@octokit/rest npm](https://www.npmjs.com/package/@octokit/rest) - Official GitHub REST API client, TypeScript support
- [Claude Agent SDK npm](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) - v0.2.39 currently installed in project

### Tertiary (LOW confidence)
- None. All critical claims verified with official documentation or the existing codebase.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries are either already installed (Agent SDK, BullMQ) or well-established with official docs (simple-git, @octokit/rest)
- Architecture: HIGH - Worker-orchestrated git pattern directly extends the existing Phase 3 worker pattern. Agent SDK tool configuration verified from official TypeScript reference.
- Pitfalls: HIGH - Git branch management, concurrent access, and agent timeout recovery are well-understood problems with documented solutions. Rejection loop limit is a design decision, not a technical uncertainty.
- Agent prompting: MEDIUM - The quality of code generated by the development agent depends heavily on prompt engineering, which will require iteration. The SDK tools work, but the agent's ability to produce correct code for arbitrary projects is inherently variable.

**Research date:** 2026-02-12
**Valid until:** 2026-03-12 (30 days -- simple-git and @octokit/rest are stable; Agent SDK may have minor updates)
