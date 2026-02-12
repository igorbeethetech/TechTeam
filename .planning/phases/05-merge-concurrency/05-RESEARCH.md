# Phase 5: Merge and Concurrency - Research

**Researched:** 2026-02-12
**Domain:** Merge queue orchestration, git merge conflict detection/resolution, AI-assisted conflict resolution, concurrent development with git worktrees, BullMQ concurrency control
**Confidence:** HIGH

## Summary

Phase 5 adds two critical capabilities to the TechTeam pipeline: (1) an automated merge queue that processes approved PRs in FIFO order with escalating conflict resolution strategies, and (2) concurrency control that allows multiple demands to develop simultaneously within configurable limits.

The merge queue operates as a 3-step escalation: Step 1 attempts an automatic `git merge` of the demand branch into the default branch and runs tests; Step 2, if conflicts exist, invokes an AI agent (Claude) to read the conflict markers, semantically resolve them, and re-run tests; Step 3, if the AI cannot resolve, marks the demand as `needs_human` with conflict context displayed on the Kanban board for manual intervention. The critical architectural decision is that **merging happens locally via `simple-git` (not via GitHub's merge API)** -- this allows the worker to attempt conflict resolution before pushing, and only pushes the clean merge result. The GitHub PR is updated post-merge by pushing the merged default branch.

Concurrency control requires solving two distinct problems: (a) limiting how many demands can be in the Development stage simultaneously per project (`maxConcurrentDev`), and (b) ensuring concurrent development demands have isolated working directories so they don't corrupt each other's git state. **BullMQ's group concurrency feature is Pro-only** (`@taskforcesh/bullmq-pro`), so concurrency limiting must be implemented at the application level using a dedicated `merge-queue` BullMQ queue with `globalConcurrency: 1` per project (or a single merge queue with application-level per-project serialization). For concurrent development, **git worktrees** are the recommended approach: they share the `.git` directory (saving disk space) while providing independent working directories for each demand branch.

**Primary recommendation:** Implement merge as a new BullMQ queue (`merge-queue`) processed sequentially per project via application-level locking. Use `simple-git`'s `merge()` method for Step 1 (auto-merge), the Claude Agent SDK for Step 2 (AI conflict resolution with file tools), and a `needs_human` status with dashboard notification for Step 3. Use `git worktree` (via `simple-git`) for concurrent development isolation, gated by a Redis-based semaphore tracking active development slots per project.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| simple-git | ^3.30.0 (installed) | Git merge, conflict detection, worktree management | Already in stack. `merge()` returns `MergeSummary` with `conflicts[]` array. `git.raw(['worktree', ...])` for worktree operations. |
| @octokit/rest | ^22.0.1 (installed) | PR status updates, merge status checks | Already in stack. `pulls.merge()` for final GitHub merge, `pulls.update()` for PR comments/status. |
| bullmq | ^5.68.0 (installed) | Merge queue job processing, concurrency control | Already in stack. New `merge-queue` queue for merge jobs. `setGlobalConcurrency(1)` for sequential merge processing per project. |
| @anthropic-ai/claude-agent-sdk | ^0.2.39 (installed) | AI-powered conflict resolution (Step 2) | Already in stack. Invoke agent with file tools (`Read`, `Write`, `Edit`, `Bash`) to resolve merge conflict markers in the working directory. |
| ioredis | ^5.9.2 (installed) | Redis-based semaphore for dev slot tracking | Already in stack. Use Redis keys for per-project concurrency counting. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @techteam/database | workspace:* | Prisma client for merge status tracking | Demand `mergeStatus`, `mergeConflicts`, `mergeAttempts` fields already exist in schema. |
| @techteam/shared | workspace:* | Shared types and schemas | New merge-related types and API schemas. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Local git merge (simple-git) | GitHub API `pulls.merge()` | GitHub API merge doesn't allow pre-merge conflict resolution. Once you call `pulls.merge()`, it either succeeds or fails with 405/409. No opportunity for AI resolution. Local merge allows inspecting conflicts, resolving them, then pushing the clean result. |
| Application-level concurrency | BullMQ Pro group concurrency | BullMQ Pro ($) provides `WorkerPro` with `group.concurrency` -- exactly what we need. But it's a paid dependency. Application-level control with Redis semaphore is free and sufficient for our scale (1-3 concurrent devs per project). |
| git worktree | Separate repo clones | Clones duplicate the entire `.git` history (hundreds of MB for large repos). Worktrees share the `.git` directory, using only ~1x working tree size per worktree. Worktrees also auto-share fetches. |
| git worktree | Single repoPath with branch checkout | Current approach (Phase 4). Only works for `maxConcurrentDev: 1`. Multiple demands would overwrite each other's branches in the same working directory. |
| Redis semaphore | Database-level locking | Redis is faster for high-frequency checks and already in stack. DB locking would add Prisma query overhead for every concurrency check. |
| Sequential merge per project (FIFO) | GitHub merge queue (native) | GitHub's native merge queue is a repository setting, not API-controllable. It requires branch protection rules and doesn't integrate with our pipeline stages. Custom FIFO gives us full control. |

**Installation:**
```bash
# No new packages needed -- all dependencies already installed
```

## Architecture Patterns

### Recommended Project Structure

```
apps/api/
  src/
    queues/
      agent.queue.ts             # EXISTING: Agent pipeline queue
      agent.worker.ts            # MODIFIED: After testing approval, enqueue merge job
      merge.queue.ts             # NEW: Merge queue definition
      merge.worker.ts            # NEW: Merge worker (3-step merge logic)
    agents/
      merge-resolver.agent.ts    # NEW: AI conflict resolution agent (Step 2)
    lib/
      git.ts                     # MODIFIED: Add merge, worktree, conflict detection functions
      github.ts                  # MODIFIED: Add mergePullRequest(), closePullRequest() functions
      concurrency.ts             # NEW: Redis-based dev slot semaphore
    routes/
      demands.ts                 # MODIFIED: Add merge resolution endpoint
      merge.ts                   # NEW: Merge status/conflict endpoints for dashboard
packages/database/
  prisma/
    schema.prisma                # EXISTING: mergeStatus, mergeConflicts, mergeAttempts already defined
packages/shared/
  src/
    schemas/
      agent.ts                   # MODIFIED: Add mergeResolverOutputSchema
    types/
      index.ts                   # EXISTING: MergeStatus types already defined
```

### Pattern 1: 3-Step Merge Escalation

**What:** Sequential merge strategy with automatic escalation from auto-merge to AI resolution to human intervention.

**When to use:** Every merge job execution.

**Example:**
```typescript
// apps/api/src/queues/merge.worker.ts
async function handleMergeJob(job: Job<MergeJobData>) {
  const { demandId, tenantId, projectId } = job.data
  const prisma = forTenant(tenantId)

  const demand = await prisma.demand.findUniqueOrThrow({ where: { id: demandId } })
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } })

  const branchName = demand.branchName as string
  const git = createGitClient(project.repoPath)

  // Update merge status to pending
  await prisma.demand.update({
    where: { id: demandId },
    data: { mergeStatus: "pending", mergeAttempts: { increment: 1 } },
  })

  // Step 1: Auto-merge attempt
  try {
    await git.fetch("origin")
    await git.checkout(project.defaultBranch)
    await git.pull("origin", project.defaultBranch)
    await git.merge([branchName, "--no-ff"])

    // Run tests after merge
    const testsPass = await runPostMergeTests(project.repoPath)
    if (!testsPass) {
      await git.reset(["--hard", `origin/${project.defaultBranch}`])
      throw new Error("Post-merge tests failed")
    }

    // Push merged default branch
    await git.push("origin", project.defaultBranch)

    // Mark as merged
    await prisma.demand.update({
      where: { id: demandId },
      data: { mergeStatus: "merged", stage: "done" },
    })
    return
  } catch (err) {
    // Check if it's a merge conflict (not a test failure)
    if (isMergeConflict(err)) {
      // Abort the failed merge
      await git.merge(["--abort"])

      // Step 2: AI conflict resolution
      const resolved = await attemptAIResolution({
        demandId, tenantId, projectId, branchName, project, prisma,
      })
      if (resolved) return

      // Step 3: Escalate to human
      await escalateToHuman({ demandId, prisma, conflicts: extractConflicts(err) })
    } else {
      throw err // Re-throw non-conflict errors for BullMQ retry
    }
  }
}
```

### Pattern 2: AI Conflict Resolution Agent (Step 2)

**What:** An AI agent invoked with file system tools to semantically resolve merge conflict markers in the working directory, then verify the resolution by running tests.

**When to use:** When `git merge` fails with conflicts (Step 1 failed).

**Example:**
```typescript
// apps/api/src/agents/merge-resolver.agent.ts
export async function runMergeResolverAgent(params: {
  demandId: string
  tenantId: string
  projectId: string
  repoPath: string
  branchName: string
  defaultBranch: string
  conflictFiles: string[]
  timeout: number
}): Promise<MergeResolverResult> {
  const prompt = buildMergeResolverPrompt(params)

  const result = await executeAgent({
    prompt,
    timeoutMs: params.timeout,
    cwd: params.repoPath,
    allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
    maxTurns: 30,
    systemPrompt: [
      "You are a merge conflict resolver. You have access to a repository",
      "with active merge conflicts. Your job is to:",
      "1. Read each conflicted file and understand both sides of the conflict",
      "2. Resolve the conflict markers (<<<<<<< ======= >>>>>>>) by choosing",
      "   the correct resolution that preserves both changes when possible",
      "3. After resolving all conflicts, run `git add .` to stage resolutions",
      "4. Verify the resolution by running any available test commands",
      "Do NOT run git merge, git commit, or git push. Only resolve conflicts",
      "and stage the resolved files.",
    ].join("\n"),
  })

  return {
    resolved: true, // Parsed from structured output
    output: result.output,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    costUsd: result.costUsd,
    durationMs: result.durationMs,
  }
}
```

### Pattern 3: Redis-Based Development Slot Semaphore

**What:** A Redis-based semaphore that tracks active development slots per project, enforcing `maxConcurrentDev` limits. Demands exceeding the limit wait in queue.

**When to use:** Before starting development phase for any demand.

**Example:**
```typescript
// apps/api/src/lib/concurrency.ts
import IORedis from "ioredis"

const SLOT_KEY_PREFIX = "techteam:dev-slots:"
const SLOT_TTL = 3600 // 1 hour TTL as safety net

export async function acquireDevSlot(
  redis: IORedis,
  projectId: string,
  demandId: string,
  maxConcurrent: number,
): Promise<boolean> {
  const key = `${SLOT_KEY_PREFIX}${projectId}`

  // Lua script for atomic check-and-acquire
  const script = `
    local current = redis.call('SCARD', KEYS[1])
    if current < tonumber(ARGV[1]) then
      redis.call('SADD', KEYS[1], ARGV[2])
      redis.call('EXPIRE', KEYS[1], ARGV[3])
      return 1
    end
    return 0
  `

  const result = await redis.eval(script, 1, key, maxConcurrent, demandId, SLOT_TTL)
  return result === 1
}

export async function releaseDevSlot(
  redis: IORedis,
  projectId: string,
  demandId: string,
): Promise<void> {
  const key = `${SLOT_KEY_PREFIX}${projectId}`
  await redis.srem(key, demandId)
}

export async function getActiveDevCount(
  redis: IORedis,
  projectId: string,
): Promise<number> {
  const key = `${SLOT_KEY_PREFIX}${projectId}`
  return redis.scard(key)
}
```

### Pattern 4: Git Worktree for Concurrent Development

**What:** Each concurrent demand gets its own git worktree instead of sharing the project's `repoPath`. Worktrees share the `.git` directory but have independent working directories.

**When to use:** When `maxConcurrentDev > 1` for a project.

**Example:**
```typescript
// apps/api/src/lib/git.ts (additions)

export async function createWorktree(
  repoPath: string,
  worktreePath: string,
  branchName: string,
): Promise<void> {
  const git = createGitClient(repoPath)
  await git.raw(["worktree", "add", worktreePath, "-b", branchName, `origin/${await getDefaultBranch(repoPath)}`])
}

export async function removeWorktree(
  repoPath: string,
  worktreePath: string,
): Promise<void> {
  const git = createGitClient(repoPath)
  await git.raw(["worktree", "remove", worktreePath, "--force"])
}

export function getWorktreePath(repoPath: string, demandId: string): string {
  // Worktrees live as siblings of the main repo
  const parentDir = path.dirname(repoPath)
  const repoName = path.basename(repoPath)
  return path.join(parentDir, `.worktrees`, `${repoName}-${demandId}`)
}
```

### Pattern 5: Merge Queue FIFO Processing

**What:** A dedicated `merge-queue` BullMQ queue processes merge jobs sequentially per project. When a demand's testing phase approves, it enqueues a merge job. The merge worker processes jobs in FIFO order.

**When to use:** Every time a demand is approved by the testing agent.

**Example:**
```typescript
// apps/api/src/queues/merge.queue.ts
import { Queue } from "bullmq"
import { createQueueConnection } from "../lib/redis.js"

export interface MergeJobData {
  demandId: string
  tenantId: string
  projectId: string
}

export const mergeQueue = new Queue<MergeJobData>("merge-queue", {
  connection: createQueueConnection(),
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
})

// Enforce sequential processing per project
// This is achieved by setting globalConcurrency to 1 on the worker
// and processing one merge at a time. Per-project serialization
// is handled by the worker checking if another merge is in progress
// for the same project before starting.
```

### Pattern 6: Concurrency Gating in the Agent Worker

**What:** Before starting a development phase job, the worker checks whether a dev slot is available for the project. If not, the job is delayed and re-enqueued.

**When to use:** At the start of every development phase job.

**Example:**
```typescript
// In agent.worker.ts, before handleDevelopmentPhase:
if (phase === "development") {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
  })

  const acquired = await acquireDevSlot(
    redis, projectId, demandId, project.maxConcurrentDev
  )

  if (!acquired) {
    // Re-enqueue with delay -- will retry after other demands complete
    await agentQueue.add("run-agent", job.data, {
      delay: 30_000, // 30 seconds
      jobId: `dev-retry-${demandId}-${Date.now()}`,
    })
    // Mark demand as queued (waiting for slot)
    await prisma.demand.update({
      where: { id: demandId },
      data: { agentStatus: "queued" },
    })
    return { output: null }
  }

  try {
    await handleDevelopmentPhase(ctx)
  } finally {
    await releaseDevSlot(redis, projectId, demandId)
  }
}
```

### Anti-Patterns to Avoid

- **Merging via GitHub API without local check:** `octokit.pulls.merge()` is an atomic operation -- it either succeeds or fails with no opportunity for conflict resolution. Always merge locally first, resolve conflicts if needed, then push.
- **Using BullMQ Pro for group concurrency:** The project uses open-source BullMQ. Group concurrency is Pro-only (`@taskforcesh/bullmq-pro`). Use application-level concurrency control with Redis instead.
- **Sharing a single repoPath for concurrent development:** When `maxConcurrentDev > 1`, two development agents writing to the same directory will corrupt each other. Use git worktrees.
- **Merge queue without per-project serialization:** If two demands for the same project try to merge simultaneously, they will conflict with each other. Merge must be serialized per project.
- **Not aborting failed merges:** If `git merge` fails with conflicts and you don't run `git merge --abort`, the repo stays in a "merging" state that blocks all subsequent operations.
- **AI resolution agent running git merge/commit/push:** The merge resolver agent should ONLY resolve conflict markers and stage files. The worker handles the git merge state, commit, and push.
- **Not running tests after AI resolution:** Even if the AI resolves all conflict markers syntactically, the code may not compile or pass tests. Always validate with a test run after resolution.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Merge conflict detection | Parse git stderr output | `simple-git` `merge()` with `GitResponseError<MergeSummary>` | `MergeSummary.conflicts[]` gives typed conflict info (file, reason, meta). Manual stderr parsing is fragile. |
| Per-project job serialization | Custom distributed mutex | Redis SET with NX + TTL + Lua script for atomic acquire/release | Well-known pattern. Lua script ensures atomic check-and-set. TTL prevents deadlocks on crash. |
| Git worktree management | `child_process.exec('git worktree ...')` | `simple-git` `git.raw(['worktree', 'add', ...])` | Consistent with existing git operations. Typed error handling. No shell escaping issues. |
| Conflict file extraction | Regex on merge output | `MergeSummary.conflicts.map(c => c.file)` | Typed, tested, maintained by simple-git. |
| GitHub PR merge | Manual `fetch('PUT /repos/.../pulls/.../merge')` | `octokit.rest.pulls.merge({ merge_method: 'merge' })` | Typed, auto-auth, proper error codes (405 = not mergeable, 409 = conflict). |
| Dev slot counting | Database counter with optimistic locking | Redis SCARD/SADD/SREM on a Set | Atomic, fast, no DB roundtrip. Set naturally deduplicates. |

**Key insight:** The merge queue's complexity lies in orchestration (the 3-step escalation, state management, cleanup on failure), not in the individual operations. Each operation uses an existing library. The challenge is composing them correctly with proper error handling and rollback at each step.

## Common Pitfalls

### Pitfall 1: Merge State Corruption After Failed AI Resolution

**What goes wrong:** AI resolution agent leaves conflict markers in files, or partially resolves conflicts, and the worker tries to commit the dirty state.
**Why it happens:** AI agent may not resolve ALL conflicts, or may resolve them incorrectly (leaving partial markers).
**How to avoid:** After AI resolution, check for remaining conflict markers by running `git diff --check` (detects conflict markers). If any remain, abort with `git merge --abort` and escalate to human. Also verify `git status` shows no unmerged paths.
**Warning signs:** Commits containing `<<<<<<<`, `=======`, `>>>>>>>` markers.

### Pitfall 2: Stale Branch Before Merge

**What goes wrong:** The demand branch is based on an old version of the default branch, causing unnecessary conflicts.
**Why it happens:** Time passes between testing approval and merge execution. Other demands may have merged into the default branch since then.
**How to avoid:** Before merging, always `git fetch origin` and `git pull origin {defaultBranch}` to get the latest default branch. Consider rebasing the demand branch onto the latest default before merge: `git rebase origin/{defaultBranch} {branchName}`.
**Warning signs:** Merge conflicts in files that were not changed by the demand.

### Pitfall 3: Deadlocked Dev Slots

**What goes wrong:** A development job crashes without releasing its dev slot, blocking all subsequent demands for that project.
**Why it happens:** Worker crash, timeout without cleanup, or unhandled exception.
**How to avoid:** Use TTL on Redis keys as a safety net (e.g., 1 hour). Use `try/finally` to always release slots. Add a periodic cleanup job that checks for slots held by demands no longer in `development` stage.
**Warning signs:** Demands stuck in `queued` state indefinitely; `SCARD` on the slot key shows full capacity but no active development agents.

### Pitfall 4: Merge Order Violation

**What goes wrong:** Demand B merges before Demand A, even though A finished testing first.
**Why it happens:** Race condition if merge queue isn't strictly serialized per project, or if delayed retries process out of order.
**How to avoid:** Use a single merge queue with `globalConcurrency: 1` per worker. Before processing a merge job, check if there are pending merge jobs for the same project with earlier completion timestamps. If so, delay the current job.
**Warning signs:** Git history shows commits in unexpected order; later demands overwrite earlier demands' changes.

### Pitfall 5: Git Worktree Zombie Directories

**What goes wrong:** Worktree directories accumulate on disk after demands complete, consuming disk space.
**Why it happens:** `git worktree remove` not called after merge completes or demand is cancelled.
**How to avoid:** Always clean up worktrees in the merge worker's `finally` block. Add a periodic cleanup job: `git worktree prune` removes stale worktree entries. After merge or on demand cancellation, explicitly remove the worktree.
**Warning signs:** Disk space growth over time; `git worktree list` shows many entries.

### Pitfall 6: Concurrent Merges Overwriting Each Other

**What goes wrong:** Two merge jobs for the same project run simultaneously, both checkout the default branch, and the second push overwrites the first's merge commit.
**Why it happens:** Merge queue worker concurrency > 1, or two worker instances processing the same project.
**How to avoid:** Serialize merge processing per project. Use a Redis lock (`SET projectId:merge-lock NX EX 300`) before starting a merge. Only one merge job per project at a time.
**Warning signs:** Merged demands' changes disappearing after subsequent merges; git reflog shows force-push-like overwrites.

### Pitfall 7: Node.js Dependencies in Worktrees

**What goes wrong:** Development agent fails because `node_modules` doesn't exist in the worktree.
**Why it happens:** Git worktrees don't share `node_modules`. Each worktree needs its own `npm install`.
**How to avoid:** After creating a worktree, run `npm install` (or `pnpm install`) before invoking the development agent. This is part of the worktree setup step.
**Warning signs:** Build/lint/test failures in worktrees with errors about missing modules.

## Code Examples

Verified patterns from official sources:

### simple-git Merge with Conflict Detection

```typescript
// Source: simple-git README + TypeScript definitions
import simpleGit, { MergeSummary, GitResponseError } from "simple-git"

const git = simpleGit(repoPath)

try {
  // Attempt merge with no-fast-forward
  const result: MergeSummary = await git.merge([branchName, "--no-ff"])
  console.log(`Merged ${result.merges.length} files`)
  // result.conflicts is empty on success
} catch (err) {
  if (err instanceof GitResponseError) {
    const summary: MergeSummary = err.git
    console.error(`Merge conflicts in ${summary.conflicts.length} files:`)
    for (const conflict of summary.conflicts) {
      console.error(`  ${conflict.file}: ${conflict.reason}`)
      // conflict.meta contains deletion info if applicable
    }
    // Abort the merge to clean up
    await git.merge(["--abort"])
  } else {
    throw err
  }
}
```

### Octokit PR Merge (for final GitHub-side merge after local verification)

```typescript
// Source: Octokit REST docs - pulls.merge
import { Octokit } from "@octokit/rest"

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })
const { owner, repo } = extractOwnerRepo(project.repoUrl)

// Extract PR number from prUrl (e.g., "https://github.com/owner/repo/pull/42")
const prNumber = parseInt(demand.prUrl!.split("/").pop()!)

try {
  const { data } = await octokit.rest.pulls.merge({
    owner,
    repo,
    pull_number: prNumber,
    merge_method: "merge", // or "squash" or "rebase"
    commit_title: `[Demand ${demand.id}] ${demand.title}`,
  })
  console.log(`PR merged: ${data.sha}`)
} catch (err: any) {
  if (err.status === 405) {
    // PR not mergeable (e.g., merge conflicts, required checks failing)
    console.error("PR cannot be merged:", err.message)
  } else if (err.status === 409) {
    // Head branch was modified, SHA mismatch
    console.error("PR head was modified:", err.message)
  }
}
```

### Redis Dev Slot Semaphore (Lua Script)

```typescript
// Source: Redis EVAL documentation + standard distributed semaphore pattern
import IORedis from "ioredis"

const redis = new IORedis(config.REDIS_URL)

// Atomic acquire: check capacity and add demand to set
const acquireScript = `
  local key = KEYS[1]
  local maxSlots = tonumber(ARGV[1])
  local demandId = ARGV[2]
  local ttl = tonumber(ARGV[3])

  local current = redis.call('SCARD', key)
  if current < maxSlots then
    redis.call('SADD', key, demandId)
    redis.call('EXPIRE', key, ttl)
    return 1
  end
  return 0
`

const acquired = await redis.eval(acquireScript, 1,
  `dev-slots:${projectId}`, maxConcurrentDev, demandId, 3600)

if (acquired === 1) {
  try {
    // ... run development phase ...
  } finally {
    await redis.srem(`dev-slots:${projectId}`, demandId)
  }
}
```

### Git Worktree Operations

```typescript
// Source: git-worktree documentation + simple-git raw command support
import simpleGit from "simple-git"
import path from "node:path"

const git = simpleGit(repoPath)

// Create worktree for a demand
const worktreePath = path.join(
  path.dirname(repoPath),
  ".worktrees",
  `${path.basename(repoPath)}-${demandId}`
)

// Create new worktree with new branch from remote default branch
await git.raw([
  "worktree", "add",
  worktreePath,
  "-b", branchName,
  `origin/${defaultBranch}`,
])

// ... agent works in worktreePath ...

// Cleanup after merge or cancellation
await git.raw(["worktree", "remove", worktreePath, "--force"])
await git.raw(["worktree", "prune"])
```

### Merge Worker Complete Flow

```typescript
// apps/api/src/queues/merge.worker.ts - full flow skeleton
async function processMergeJob(job: Job<MergeJobData>) {
  const { demandId, tenantId, projectId } = job.data
  const prisma = forTenant(tenantId)
  const demand = await prisma.demand.findUniqueOrThrow({ where: { id: demandId } })
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } })
  const git = createGitClient(project.repoPath)

  // Ensure we have the latest default branch
  await git.fetch("origin")
  await git.checkout(project.defaultBranch)
  await git.pull("origin", project.defaultBranch)

  // ---- STEP 1: Auto-merge ----
  try {
    await git.merge([demand.branchName!, "--no-ff"])
    // Verify with tests
    if (await runTests(project.repoPath)) {
      await git.push("origin", project.defaultBranch)
      await markMerged(prisma, demandId)
      return
    }
    // Tests failed after clean merge -- reset and fail
    await git.reset(["--hard", `origin/${project.defaultBranch}`])
    throw new Error("Post-merge tests failed")
  } catch (err) {
    if (!isMergeConflict(err)) throw err
    await git.merge(["--abort"])
  }

  // ---- STEP 2: AI resolution ----
  await prisma.demand.update({
    where: { id: demandId },
    data: { mergeStatus: "conflict_resolving" },
  })

  // Re-attempt merge (leaves conflict markers in working dir)
  try {
    await git.merge([demand.branchName!])
  } catch { /* expected -- conflicts */ }

  // List conflicted files
  const status = await git.status()
  const conflictedFiles = status.conflicted

  if (conflictedFiles.length > 0) {
    const resolved = await runMergeResolverAgent({
      demandId, tenantId, projectId,
      repoPath: project.repoPath,
      branchName: demand.branchName!,
      defaultBranch: project.defaultBranch,
      conflictFiles: conflictedFiles,
      timeout: 10 * 60 * 1000, // 10 min
    })

    // Verify no remaining conflict markers
    const postStatus = await git.status()
    if (postStatus.conflicted.length === 0 && resolved) {
      await git.commit(`merge: resolve conflicts for demand/${demandId}`)
      if (await runTests(project.repoPath)) {
        await git.push("origin", project.defaultBranch)
        await markMerged(prisma, demandId)
        return
      }
    }
    // AI resolution failed or tests failed
    await git.merge(["--abort"]).catch(() => {})
    await git.reset(["--hard", `origin/${project.defaultBranch}`])
  }

  // ---- STEP 3: Escalate to human ----
  await prisma.demand.update({
    where: { id: demandId },
    data: {
      mergeStatus: "needs_human",
      mergeConflicts: { files: conflictedFiles },
    },
  })
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual merge via GitHub UI | Automated merge queue with AI conflict resolution | 2025-2026 | Full automation of merge workflow; human only involved for unresolvable conflicts |
| Single repo checkout per project | Git worktrees for concurrent branch work | Git 2.5+ (2015), adopted widely 2023-2025 | Enables `maxConcurrentDev > 1` without disk space explosion |
| GitHub native merge queue | Custom FIFO merge queue with BullMQ | N/A (GitHub merge queue is limited to branch protection, not pipeline integration) | Full control over merge order, conflict resolution, and pipeline integration |
| BullMQ Pro group concurrency | Application-level Redis semaphore | N/A | Avoids paid dependency while achieving the same per-project concurrency control |

**Deprecated/outdated:**
- `git worktree lock/unlock`: Only needed for worktrees on removable media. Not applicable here.
- GitHub auto-merge: Only works when all required checks pass. Doesn't support custom merge strategies or AI resolution.

## Open Questions

1. **Merge strategy: local merge + push vs GitHub API merge**
   - What we know: Local merge via `simple-git` allows conflict resolution before pushing. GitHub API `pulls.merge()` is atomic but provides no opportunity for intervention.
   - What's unclear: After a local merge to the default branch and push, the GitHub PR will auto-close if the commits are detected. But if using `--no-ff`, the merge commit differs from what GitHub would create. Does the PR auto-close reliably?
   - Recommendation: Use local merge + push for the 3-step process. After pushing, explicitly close the PR via `octokit.rest.pulls.update({ state: 'closed' })` to avoid relying on auto-close detection. Alternatively, merge via GitHub API (squash/merge) after the local merge succeeds as verification.

2. **Worktree setup cost (npm install)**
   - What we know: Git worktrees don't share `node_modules`. Each worktree needs dependency installation.
   - What's unclear: How long `pnpm install` takes per worktree. For large projects, this could add significant overhead.
   - Recommendation: For v1, accept the install overhead (it runs once per demand). Consider optimizing later with a shared `node_modules` symlink strategy or `pnpm --store-dir` pointing to a shared store. For projects with `maxConcurrentDev: 1`, worktrees are not needed -- use the existing single-checkout approach.

3. **Merge queue ordering: timestamp-based vs position-based**
   - What we know: FIFO means "first in, first out" -- the demand that finished testing first should merge first.
   - What's unclear: Should ordering be based on when the demand entered the `merge` stage (DB timestamp), or on BullMQ job creation order?
   - Recommendation: BullMQ already processes jobs in FIFO order within a queue. So the merge queue's natural ordering (job ID / creation timestamp) is sufficient. No custom ordering logic needed. Just ensure merge jobs are enqueued at the moment testing approves.

4. **Human resolution signal mechanism**
   - What we know: When conflicts are escalated (Step 3), the user needs to: (a) see the conflict context on the dashboard, (b) resolve conflicts externally (in their IDE/GitHub), (c) signal resolution in the dashboard.
   - What's unclear: What exactly is the "signal"? Does the user click a button that re-enqueues the merge job? Or does the system detect that conflicts are resolved?
   - Recommendation: Add a `POST /demands/:id/merge/retry` endpoint. When the user clicks "Retry Merge" on the dashboard, it re-enqueues a merge job. The merge worker will attempt Step 1 again. If the user resolved conflicts externally and pushed to the demand branch, the merge should succeed. Display conflicted file names and a link to the PR on the dashboard so the user has context.

5. **Development slot release timing**
   - What we know: A dev slot is acquired when development starts and must be released when development completes.
   - What's unclear: Should the slot be released after development completes (before testing starts), or after testing completes? If held through testing, it reduces thrashing but limits throughput.
   - Recommendation: Release the dev slot when the demand exits the development stage (either advancing to testing or failing). This maximizes throughput: while one demand is in testing, another can start development. The worktree can persist through testing (the testing agent reads from it) and be cleaned up at merge time.

6. **Discovery/Planning parallelism (CONC-03)**
   - What we know: Discovery and Planning are read-only phases (no file writes, no git operations). They should run in parallel across demands without blocking.
   - What's unclear: Are there any constraints from the current worker that prevent this?
   - Recommendation: The current worker already has `concurrency: 2`, meaning it can process 2 agent jobs simultaneously. Discovery and Planning jobs don't need dev slots (they don't use the repo). They are already naturally parallel. Verify that the worker's concurrency of 2 is sufficient, or increase it. Since Discovery/Planning are lightweight (2-5 min, no file tools), the worker can safely handle higher concurrency for these phases.

## Sources

### Primary (HIGH confidence)
- [simple-git GitHub - MergeSummary.ts](https://github.com/steveukx/git-js/blob/main/simple-git/src/lib/responses/MergeSummary.ts) - MergeSummaryDetail class with `conflicts[]`, `merges[]`, `result`, `failed` properties
- [simple-git GitHub - TypeScript definitions](https://github.com/steveukx/git-js/blob/main/simple-git/typings/simple-git.d.ts) - `merge()`, `mergeFromTo()` method signatures returning `MergeResult`
- [BullMQ Docs - Global Concurrency](https://docs.bullmq.io/guide/queues/global-concurrency) - `setGlobalConcurrency()`, `getGlobalConcurrency()`, `removeGlobalConcurrency()` API
- [BullMQ Docs - Group Concurrency (Pro)](https://docs.bullmq.io/bullmq-pro/groups/concurrency) - Confirmed Pro-only feature requiring `@taskforcesh/bullmq-pro`
- [BullMQ Docs - Group Rate Limiting (Pro)](https://docs.bullmq.io/bullmq-pro/groups/rate-limiting) - Confirmed Pro-only feature
- [GitHub REST API - Merge PR](https://docs.github.com/en/rest/pulls/pulls) - `PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge` with `merge_method`, `sha` params; 405 (not mergeable), 409 (conflict) error codes
- [Octokit REST API - pulls](https://actions-cool.github.io/octokit-rest/api/pulls/) - `pulls.merge()` parameters: `owner`, `repo`, `pull_number`, `commit_title`, `commit_message`, `sha`, `merge_method`
- [Git Worktree Documentation](https://git-scm.com/docs/git-worktree) - `git worktree add`, `git worktree remove`, `git worktree prune`
- Existing codebase: `apps/api/src/lib/git.ts`, `apps/api/src/lib/github.ts`, `apps/api/src/queues/agent.worker.ts`, `packages/database/prisma/schema.prisma`

### Secondary (MEDIUM confidence)
- [Git Worktree vs Clone comparison](https://www.intertech.com/using-git-worktrees-instead-of-multiple-clones/) - Worktrees share `.git` directory, save disk space, auto-share fetches. Each needs its own `npm install`.
- [AI Merge Conflict Resolution with Claude Code](https://www.vibesparking.com/en/blog/ai/claude-code/practices/2025-09-17-git-merge-conflict-resolution/) - Semantic conflict resolution, plan-first approach, automated test verification
- [BullMQ Open Source Alternatives for Group Concurrency](https://openpanel.dev/articles/bullmq-alternative) - GroupMQ as alternative; Redis-based locking as workaround
- [simple-git npm](https://www.npmjs.com/package/simple-git) - v3.30.0, `GitResponseError<MergeSummary>` pattern for conflict handling

### Tertiary (LOW confidence)
- None. All critical claims verified with official documentation or existing codebase inspection.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed. Merge/conflict APIs verified from source code and TypeScript definitions.
- Architecture: HIGH - 3-step merge escalation is a well-understood pattern. Worktree isolation is documented git feature. Redis semaphore is a standard distributed systems pattern.
- Pitfalls: HIGH - Git state corruption, deadlocked slots, and stale branches are well-known problems with documented solutions.
- AI conflict resolution: MEDIUM - The agent can read and edit conflict markers, but success rate depends on conflict complexity. Simple conflicts (disjoint changes) should resolve reliably. Semantic conflicts (same line, different logic) may fail, requiring human escalation.

**Research date:** 2026-02-12
**Valid until:** 2026-03-12 (30 days -- all libraries are stable; merge patterns are well-established)
