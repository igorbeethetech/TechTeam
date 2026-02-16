# Phase 11: Pipeline E2E Validation - Research

**Researched:** 2026-02-16
**Domain:** End-to-end pipeline validation, agent orchestration, Git/GitHub operations, queue-driven workflows
**Confidence:** HIGH

## Summary

Phase 11 is a validation phase, not a coding phase. All the infrastructure code (agents, queues, Git operations, GitHub API, merge queue, feedback loops, WebSocket events) already exists and has been built across Phases 1-10. What has NEVER been tested is the full pipeline flowing from Inbox to Done on a real repository. The Phase 4 and Phase 5 UAT tests were entirely skipped because pipeline execution was blocked at Discovery (the clarification form did not exist at the time). The clarification form was added during Phase 3 UAT fix, but the downstream stages (Development, Testing, Merge, Done) have never been exercised in a real run.

The primary work for Phase 11 is: (1) validate and fix any bugs in the existing pipeline code that surface during real execution, (2) ensure the pipeline is exercisable on the Docker production setup, and (3) confirm each of the 5 PIPE requirements by running real demands through the system. This is fundamentally a test-and-fix phase where bugs are expected because the Development, Testing, and Merge stages have never been run with real data.

The key risk areas are: (a) Claude Agent SDK behavior with file system tools in a real repository (tool permissions, working directory, path resolution), (b) Git operations in the worker container (push credentials, branch management, remote tracking), (c) GitHub PR creation and merge (token permissions, repo URL parsing), and (d) the testing-to-development feedback loop (rejection data passing, branch re-use). The code exists for all of these but has never been integration-tested.

**Primary recommendation:** Establish a disposable test repository, create a simple demand, run it through the full pipeline, and fix bugs as they surface. This is a manual E2E validation with targeted fixes, not a test automation effort.

## Standard Stack

### Core (Already Installed)
| Component | Version | Purpose | Status |
|-----------|---------|---------|--------|
| @anthropic-ai/claude-agent-sdk | latest | Agent execution (SDK mode) | Installed, used by all agents |
| simple-git | latest | Git operations (branch, commit, push, merge) | Installed, lib/git.ts |
| @octokit/rest | latest | GitHub API (PR creation, merge, close) | Installed, lib/github.ts |
| bullmq | latest | Job queue (agent pipeline, merge queue) | Installed, both workers active |
| ioredis | latest | Redis connections (queue, PubSub, concurrency) | Installed, lib/redis.ts |
| zod | v3 | Schema validation for agent outputs | Installed, shared package |
| zod-to-json-schema | latest | Convert Zod to JSON Schema for structured output | Installed |

### Supporting (May Need)
| Component | Purpose | When to Use |
|-----------|---------|-------------|
| Docker Compose prod | Production environment | If validating in Docker containers |
| gh CLI | Quick GitHub repo/PR operations during debugging | Manual debugging only |

### No New Dependencies
This phase does not introduce any new libraries. All infrastructure code exists. The work is validation, debugging, and fixing integration issues in existing code.

## Architecture Patterns

### Existing Pipeline Flow (Complete Path)
```
User creates demand (POST /api/demands)
  -> stage: "inbox"

User drags to Discovery (PATCH /api/demands/:id/stage)
  -> agentQueue.add("run-agent", { phase: "discovery" })
  -> agent.worker.ts: runDiscoveryAgent()
  -> IF ambiguities: agentStatus = "paused", user fills clarification form
  -> IF no ambiguities: stage = "planning", auto-enqueue planning job

Planning phase (auto-triggered)
  -> agent.worker.ts: runPlanningAgent()
  -> stage = "development", auto-enqueue development job

Development phase (slot-gated)
  -> acquireDevSlot() -- concurrency control
  -> validateGitRepo() -> createIsolatedBranch()
  -> runDevelopmentAgent() with file tools (Read, Write, Edit, Bash, Glob, Grep)
  -> commitAndPush() -> createPullRequest()
  -> stage = "testing", auto-enqueue testing job
  -> releaseDevSlot()

Testing phase
  -> runTestingAgent() with read tools + Bash
  -> IF approved: stage = "merge", mergeQueue.add("merge-demand")
  -> IF rejected: rejectionCount++
    -> IF < 3: stage = "development", re-enqueue with testingFeedback
    -> IF >= 3: agentStatus = "paused" (human escalation)

Merge phase (concurrency 1)
  -> Step 1: mergeFromBranch() -- auto-merge via local git merge + push
  -> IF success: closePullRequest(), stage = "done"
  -> IF conflicts:
    -> Step 2: runMergeResolverAgent() -- AI conflict resolution
    -> IF resolved: commit + push, closePullRequest(), stage = "done"
    -> Step 3: mergeStatus = "needs_human" -- human escalation
```

### Key Code Locations
```
apps/api/src/
  agents/
    agent-router.ts          # SDK/CLI dispatch
    base-agent.ts             # SDK executor (@anthropic-ai/claude-agent-sdk)
    base-agent-cli.ts         # CLI executor (claude subprocess)
    discovery.agent.ts        # Discovery phase prompt/schema
    planning.agent.ts         # Planning phase prompt/schema
    development.agent.ts      # Development phase prompt/schema + file tools
    testing.agent.ts          # Testing phase prompt/schema + read tools
    merge-resolver.agent.ts   # Merge conflict resolution prompt/schema
  queues/
    agent.queue.ts            # BullMQ agent pipeline queue
    agent.worker.ts           # Main worker: phase dispatch, stage advancement, feedback loop
    merge.queue.ts            # BullMQ merge queue
    merge.worker.ts           # Merge worker: 3-step escalation
  lib/
    git.ts                    # simple-git wrappers (branch, commit, push, merge, worktree)
    github.ts                 # Octokit wrappers (PR create, merge, close, token fetch)
    concurrency.ts            # Redis dev slot semaphore
    config.ts                 # Environment config
    redis.ts                  # Redis connection factories
    ws-events.ts              # WebSocket event publisher
  routes/
    demands.ts                # Demand CRUD + clarify + stage change
    merge.ts                  # Merge retry + status
    settings.ts               # Tenant settings (GitHub token, API key, execution mode)
  worker.ts                   # Worker entry point (creates both workers)
```

### Anti-Patterns to Avoid
- **Writing unit tests for E2E validation:** This phase validates integration. The system has no unit test infrastructure and this is not the time to build one. Manual E2E is the correct approach.
- **Mocking agents:** The goal is to prove the REAL pipeline works. Mocking would defeat the purpose.
- **Using a production repository:** Use a disposable test repo so failed runs, stale branches, and test PRs don't pollute real projects.
- **Running with CLI mode in Docker:** Known ENOENT issue. Use SDK mode (ANTHROPIC_API_KEY) for Docker validation.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Test repository | Complex test harness | A real GitHub repo with simple code | Real git operations on real repos are the whole point |
| Pipeline orchestration | Custom test orchestrator | The existing BullMQ pipeline | We're testing the actual system, not a simulation |
| Agent mocking | Stub agents | Real Claude agents (SDK mode) | E2E means E2E -- agents must actually run |
| PR verification | Custom GitHub checks | Direct visual inspection + API queries | Phase 11 is human-validated, not automated |

**Key insight:** Phase 11's value comes from exercising the exact production code path, not from building test infrastructure.

## Common Pitfalls

### Pitfall 1: Development Agent Working Directory Mismatch
**What goes wrong:** Development agent runs with `cwd: project.repoPath` but this path may not be correct inside Docker containers. The repo must be accessible at the path stored in the database.
**Why it happens:** Project `repoPath` is set during project creation and points to a host filesystem path. In Docker, repos are mounted at `/app/repos` via a named volume. If the database was seeded outside Docker, the path won't match.
**How to avoid:** When creating the test project, set `repoPath` to match the environment -- for Docker, use `/app/repos/<name>`; for local dev, use the actual local path.
**Warning signs:** "Project repoPath does not exist or is not a git repository" error in worker logs.

### Pitfall 2: GitHub Push Authentication in Worker
**What goes wrong:** `commitAndPush()` calls `git push origin <branch>` but git needs authentication to push to GitHub. The worker container may not have credentials configured.
**Why it happens:** The code uses `simple-git` which relies on the system's git credential configuration. In Docker, there's no credential helper set up.
**How to avoid:** The repo's remote URL must include the token (e.g., `https://<token>@github.com/owner/repo.git`) OR git must be configured with a credential helper that uses the tenant's GitHub token. The simplest approach is to update the remote URL before push operations.
**Warning signs:** `git push` fails with 403 or "Authentication failed" errors.

### Pitfall 3: Testing Agent Uses Wrong Branch/Worktree
**What goes wrong:** Testing agent runs with `cwd: project.repoPath` but development may have used a worktree at a different path (when `maxConcurrentDev > 1`).
**Why it happens:** In `handleTestingPhase()`, the code does `git.checkout(branchName)` on `project.repoPath` (the main repo), not on the worktree path. This works for single-dev mode but may have issues if the branch was created in a worktree.
**How to avoid:** For E2E validation, use `maxConcurrentDev: 1` to avoid worktree complexity. The worktree path isn't tracked on the demand and testing agent always uses the base repo.
**Warning signs:** "Branch not found" or testing agent sees different files than what development agent created.

### Pitfall 4: Discovery Agent Always Finds Ambiguities
**What goes wrong:** Every demand pauses at Discovery because the agent finds ambiguities in the description, requiring human intervention via the clarification form before advancing.
**Why it happens:** Claude is trained to be thorough and will find ambiguities in any description that isn't perfectly detailed. The discovery agent prompt says "If any part of the demand is ambiguous, unclear, or missing critical information, add it to the ambiguities array."
**How to avoid:** Write an extremely detailed and specific demand description that leaves no room for ambiguity. Include tech stack, file paths, exact behavior, and acceptance criteria. Alternatively, be prepared to answer clarification questions quickly to unblock the pipeline.
**Warning signs:** Demand stays in Discovery with agentStatus: "paused" and ambiguities array is populated.

### Pitfall 5: Agent SDK Tool Permissions
**What goes wrong:** Development agent fails because it cannot use file system tools (Read, Write, Edit, Bash) even though they are specified in `allowedTools`.
**Why it happens:** The Claude Agent SDK `permissionMode: "bypassPermissions"` and `allowDangerouslySkipPermissions: true` flags must work correctly. If the SDK version has changed or these flags don't work as expected, tools will be blocked.
**How to avoid:** Verify the agent SDK version supports these permission flags. Check worker logs for tool permission errors. The base-agent.ts code already sets both flags.
**Warning signs:** Agent output is incomplete, no files changed, or error messages about tool permissions in agent run output.

### Pitfall 6: Merge Worker Pushes to Default Branch Directly
**What goes wrong:** Merge worker does `git push origin <defaultBranch>` which requires push permissions to the default branch. If branch protection rules are enabled on the target repo, this will fail.
**Why it happens:** The merge strategy is local merge + push, not GitHub API merge. The code in `merge.worker.ts` merges locally and pushes the result.
**How to avoid:** Ensure the target test repository has NO branch protection rules on the default branch. Alternatively, the GitHub token needs admin or bypass permissions.
**Warning signs:** `git push` fails with "branch is protected" or "required status checks" errors.

### Pitfall 7: PR Already Exists for Branch
**What goes wrong:** On a retry (testing rejection -> development re-run -> push), the PR already exists and the code skips PR creation. This is the correct behavior, but if the initial PR creation failed and `prUrl` is null, the re-run will try to create a new PR which might conflict.
**Why it happens:** The code checks `if (!prUrl)` before creating a PR. If the first run failed AFTER the push but BEFORE PR creation, subsequent runs will push to the existing branch and try to create the PR again -- which should work since the branch already exists on the remote.
**How to avoid:** This is likely handled correctly. Monitor for "Pull request already exists" errors from GitHub API.
**Warning signs:** GitHub API returns 422 "Pull request already exists for this branch."

### Pitfall 8: Agent Output Parsing Failures
**What goes wrong:** Development agent produces output that doesn't match `developmentOutputSchema` exactly. The code uses `safeParse` and falls back to `null`, but downstream code may not handle null output gracefully.
**Why it happens:** With complex code generation tasks and 50 turns, the agent may exhaust turns before producing the structured output, or produce slightly malformed JSON.
**How to avoid:** The `commitAndPush` function and PR creation logic handle null output with fallback values (e.g., default commit message). Monitor whether this path works cleanly.
**Warning signs:** `agentResult.output` is null in worker logs; commit message falls back to generic text.

## Code Examples

### Critical Path: How the Demand Stage Changes Trigger the Pipeline

When a user drags a demand to Discovery on the Kanban board:
```typescript
// apps/api/src/routes/demands.ts - PATCH /:id/stage
if (parsed.data.stage === "discovery") {
  await agentQueue.add("run-agent", {
    demandId: id,
    tenantId: request.session!.session.activeOrganizationId!,
    projectId: demand.projectId,
    phase: "discovery",
  })
  await request.prisma.demand.update({
    where: { id },
    data: { agentStatus: "queued" },
  })
}
```

### Critical Path: Development Handler Git Flow
```typescript
// apps/api/src/queues/agent.worker.ts - handleDevelopmentPhase
// 1. Acquire concurrency slot
const acquired = await acquireDevSlot(redis, projectId, demandId, project.maxConcurrentDev)

// 2. Create branch (first run) or checkout existing branch (rejection re-entry)
if (!branchName) {
  const slug = demand.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50)
  branchName = `demand/${demand.id}-${slug}`
  await createIsolatedBranch(project.repoPath, branchName, project.defaultBranch)
  await prisma.demand.update({ where: { id: demandId }, data: { branchName } })
} else {
  const git = createGitClient(project.repoPath)
  await git.checkout(branchName)
}

// 3. Run development agent with file tools
const agentResult = await runDevelopmentAgent({ demandId, tenantId, projectId, timeout, rejectionFeedback })

// 4. Commit and push changes
const commitMessage = agentResult.output?.commitMessage ?? `feat(demand/${demand.id}): ${demand.title}`
await commitAndPush(effectiveRepoPath, branchName, commitMessage)

// 5. Create PR (first run only)
if (!prUrl) {
  const newPrUrl = await createPullRequest({ repoUrl: project.repoUrl, title, body, head: branchName, base: project.defaultBranch, token: githubToken })
  await prisma.demand.update({ where: { id: demandId }, data: { prUrl: newPrUrl } })
}

// 6. Advance to testing
await prisma.demand.update({ where: { id: demandId }, data: { stage: "testing", agentStatus: "queued" } })
await agentQueue.add("run-agent", { demandId, tenantId, projectId, phase: "testing" })
```

### Critical Path: Testing Verdict and Feedback Loop
```typescript
// apps/api/src/queues/agent.worker.ts - handleTestingPhase
if (testResult.approved) {
  // Advance to merge
  await prisma.demand.update({ where: { id: demandId }, data: { stage: "merge", agentStatus: "queued" } })
  await mergeQueue.add("merge-demand", { demandId, tenantId, projectId })
} else {
  const newRejectionCount = ((demand.rejectionCount as number) ?? 0) + 1
  if (newRejectionCount >= MAX_REJECTION_CYCLES) {
    // Pause for human review
    await prisma.demand.update({ where: { id: demandId }, data: { agentStatus: "paused", rejectionCount: newRejectionCount, testingFeedback: testResult.output } })
  } else {
    // Return to development with feedback
    await prisma.demand.update({ where: { id: demandId }, data: { stage: "development", agentStatus: "queued", rejectionCount: newRejectionCount, testingFeedback: testResult.output } })
    await agentQueue.add("run-agent", { demandId, tenantId, projectId, phase: "development" })
  }
}
```

## Identified Issues Requiring Validation

### Issue 1: Git Push Authentication (HIGH priority)
**What:** `commitAndPush()` in `lib/git.ts` calls `git.push("origin", branchName, ["--set-upstream"])`. For this to work, the git remote must authenticate.
**Current state:** The `createPullRequest` function uses the Octokit REST API with a GitHub token, but git push operations use `simple-git` which relies on system-level git credentials. There is NO code that sets up git authentication before pushing.
**Impact:** Development phase will fail at the push step. This is a BLOCKER.
**Fix strategy:** Before push, update the remote URL to include the token: `git.remote(["set-url", "origin", "https://x-access-token:${token}@github.com/owner/repo.git"])`. Or use git credential helpers. This is a targeted fix in `handleDevelopmentPhase()` and `merge.worker.ts`.

### Issue 2: Merge Worker Push Authentication (HIGH priority)
**What:** `merge.worker.ts` does `git.push("origin", project.defaultBranch)` after merge. Same auth issue as Issue 1.
**Current state:** No git authentication configured in merge worker.
**Impact:** Merge phase will fail at the push step. BLOCKER.
**Fix strategy:** Same as Issue 1 -- configure git remote with token before push operations.

### Issue 3: Agent SDK Version Compatibility
**What:** The Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) API may have changed since the code was written. The `query()` function signature, options shape, and result message types need verification.
**Current state:** Code uses `query()` from the SDK with specific option fields (`permissionMode`, `allowDangerouslySkipPermissions`, `persistSession`, etc.). These are not standard documented fields for all SDK versions.
**Impact:** If the SDK API changed, all agents will fail. Medium priority -- likely works since SDK was installed recently.
**Fix strategy:** Run a single agent (discovery) first. If it fails with API/type errors, check SDK documentation and update the call signature.

### Issue 4: Docker Repo Volume Accessibility
**What:** In Docker, the worker mounts `repos:/app/repos`. The project's `repoPath` in the database must point to a path within this volume.
**Current state:** Project `repoPath` is set during project creation via the UI. If the project was created with a local path (e.g., `C:\Users\...`), it won't work in Docker.
**Impact:** Worker can't find the repository. BLOCKER for Docker validation.
**Fix strategy:** When running in Docker, clone the test repo into `/app/repos/<name>` inside the container, then create the project with `repoPath: /app/repos/<name>`.

### Issue 5: Testing Agent CWD for Worktrees
**What:** `handleTestingPhase()` always uses `project.repoPath` as the working directory, even when development was done in a worktree.
**Current state:** When `maxConcurrentDev > 1`, development uses a worktree. Testing agent checks out the branch on the main repo, which should work because the branch exists in the repo (worktrees share the same object database).
**Impact:** LOW -- for single-dev mode (maxConcurrentDev: 1), testing correctly checks out the branch on the main repo. For worktree mode, the checkout should still work because the branch was created from the main repo's origin.
**Fix strategy:** Use `maxConcurrentDev: 1` for initial validation. Worktree mode is a stretch goal.

## Test Repository Requirements

The E2E validation needs a real GitHub repository that:
1. **Is disposable** -- test branches, PRs, and merges should not pollute a real project
2. **Has simple code** -- the development agent needs to make meaningful changes without excessive complexity
3. **Has no branch protection** -- merge worker pushes directly to the default branch
4. **Is accessible** -- the GitHub token must have push/PR/merge permissions
5. **Is small** -- the development agent gets the full codebase as context; smaller is faster and cheaper

**Recommended:** Create a small test repo (e.g., `techteam-e2e-test`) with:
- A simple Node.js/TypeScript project (package.json, tsconfig.json, src/index.ts)
- A README.md
- A `main` branch as default
- No branch protection rules
- GitHub token with repo:full permissions

**Test demand examples:**
- "Add a utility function that calculates the Fibonacci sequence and export it from src/utils.ts"
- "Add a GET /health endpoint to the Express server that returns { status: 'ok' }"

These are small, unambiguous changes that the development agent should handle in a single pass.

## Validation Checklist (What the Planner Should Create Tasks For)

### Pre-Flight (Setup)
1. Create or designate a test GitHub repository
2. Clone the test repo locally (or into Docker volume)
3. Configure project in TechTeam with correct repoPath, repoUrl, and defaultBranch
4. Ensure GitHub token and Anthropic API key are configured in Settings
5. Ensure worker process is running (local or Docker)
6. Fix git push authentication (Issue 1 + 2 above)

### Happy Path: Full Pipeline (PIPE-01)
7. Create a demand with an unambiguous, detailed description
8. Drag demand to Discovery -- verify requirements output
9. IF paused (ambiguities), fill clarification form and verify resume
10. Verify auto-advance to Planning -- verify plan output
11. Verify auto-advance to Development -- verify branch creation, code changes, PR creation
12. Verify auto-advance to Testing -- verify approval/rejection report
13. IF approved: verify auto-advance to Merge, verify merge completion, verify stage: "done"

### Branch and PR (PIPE-02)
14. Verify demand.branchName is set (e.g., demand/{id}-{slug})
15. Verify branch exists on GitHub
16. Verify PR was created with correct title, body, base, and head

### Testing Verdict (PIPE-03)
17. Verify testing agent output contains: verdict, summary, testResults, codeQuality
18. Verify AgentRun record for testing phase has output populated

### Merge (PIPE-04)
19. Verify merge worker processes the job
20. Verify PR is closed after merge
21. Verify default branch has the merged changes
22. Verify demand stage is "done" and completedAt is set

### Feedback Loop (PIPE-05) -- Stretch
23. Intentionally create a demand that will produce imperfect code (e.g., "Add feature X without tests")
24. Verify testing agent rejects the PR
25. Verify demand returns to Development with testingFeedback populated
26. Verify development agent addresses feedback on second run
27. Verify rejectionCount increments correctly

## Open Questions

1. **SDK tool permissions in real use**
   - What we know: base-agent.ts sets `permissionMode: "bypassPermissions"` and `allowDangerouslySkipPermissions: true`. Development agent specifies `allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"]`.
   - What's unclear: Whether these exact option names match the current Claude Agent SDK API. The SDK may expect different field names or values.
   - Recommendation: Run discovery agent first (no tools needed) to verify basic SDK connectivity. Then test development agent (tools needed) and inspect errors.

2. **Git push credential injection**
   - What we know: The code does NOT inject GitHub tokens into git remote URLs. `simple-git` will use whatever credential is available on the system. In Docker containers, there are no credentials.
   - What's unclear: The best injection point -- should it be in `commitAndPush()` (git.ts), in `handleDevelopmentPhase()` (agent.worker.ts), or as a one-time setup?
   - Recommendation: Add token injection in `handleDevelopmentPhase()` before the first push. Also add it in `merge.worker.ts` before merge push. Use `git.remote(["set-url", "origin", tokenizedUrl])`. Restore the original URL after operations to avoid leaking the token in logs.

3. **Agent cost for E2E run**
   - What we know: Discovery and Planning use no tools and low turn limits (5 turns each). Development uses 50 turns with file tools. Testing uses 20 turns with read tools. Merge-resolver uses 30 turns with file tools.
   - What's unclear: The actual token cost for a complete pipeline run. With Sonnet model, a full run might cost $1-5 depending on repo size and complexity.
   - Recommendation: Use the default `sonnet` model. Start with a very simple demand to minimize cost. Monitor totalCostUsd on the demand after completion.

4. **Docker vs Local validation**
   - What we know: Docker deployment completed in Phase 10. The worker container has git installed and repos volume mounted.
   - What's unclear: Whether to validate in Docker or locally first. Docker adds an extra layer of complexity (container networking, volume mounts, path resolution).
   - Recommendation: Validate locally first (faster iteration, easier debugging). Once the pipeline works locally, optionally re-validate in Docker. The Claude CLI ENOENT blocker only applies to Docker+CLI mode; SDK mode should work in both environments.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: All source files in `apps/api/src/` examined directly
- Pipeline flow: `agent.worker.ts` (679 lines), `merge.worker.ts` (420 lines) -- full stage logic traced
- Database schema: `packages/database/prisma/schema.prisma` -- all models, enums, and relations
- Prior UAT results: `03-UAT.md`, `04-UAT.md`, `05-UAT.md` -- confirms Development/Testing/Merge stages were never tested
- Phase 10 research: `10-RESEARCH.md` -- Docker architecture, worker container requirements

### Secondary (MEDIUM confidence)
- Claude Agent SDK API: Based on code in `base-agent.ts` using `query()` function with structured output -- actual SDK docs not verified via Context7 for this research session
- GitHub API: Based on code in `lib/github.ts` using `@octokit/rest` -- standard patterns, verified against Octokit docs previously

### Tertiary (LOW confidence)
- Git push credential behavior in Docker: Not verified -- analysis is based on code review showing no credential injection. Needs runtime validation.
- Agent SDK tool permission flags: `permissionMode: "bypassPermissions"` and `allowDangerouslySkipPermissions: true` -- these flag names may or may not be current with the latest SDK version.

## Metadata

**Confidence breakdown:**
- Pipeline flow understanding: HIGH -- complete code trace from inbox to done, all code reviewed
- Known issues: HIGH -- git push auth gap identified with clear evidence (no token injection in git.ts or agent.worker.ts)
- Fix strategies: MEDIUM -- strategies are sound but untested (token injection into remote URL approach)
- Agent SDK compatibility: MEDIUM -- code exists and was written recently, but SDK API shape not independently verified
- Docker validation: MEDIUM -- Docker infrastructure exists from Phase 10, but E2E in Docker not yet attempted

**Research date:** 2026-02-16
**Valid until:** 2026-03-16 (30 days -- the codebase is stable and no external dependencies are expected to change)
