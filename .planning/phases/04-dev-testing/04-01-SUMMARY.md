---
phase: 04-dev-testing
plan: 01
subsystem: agent-pipeline
tags: [simple-git, octokit, claude-agent-sdk, development-agent, git, github, prisma]

# Dependency graph
requires:
  - phase: 03-agent-pipeline
    provides: "Base agent execution, discovery/planning agents, BullMQ worker, agent queue"
provides:
  - "Git operations wrapper (simple-git): branch, commit, push, reset"
  - "GitHub PR creation wrapper (@octokit/rest)"
  - "Extended base agent with tool-enabled execution (allowedTools, maxTurns, systemPrompt, model)"
  - "Development agent implementation with file system tools"
  - "Development and testing output Zod schemas"
  - "Prisma Demand model fields: rejectionCount, testingFeedback"
  - "AgentJobData extended with development/testing phases"
affects: [04-dev-testing/02, 04-dev-testing/03]

# Tech tracking
tech-stack:
  added: [simple-git, "@octokit/rest"]
  patterns: ["Tool-enabled agent execution via allowedTools parameter", "Graceful structured output fallback (safeParse)", "Rejection feedback loop via testingFeedback field"]

key-files:
  created:
    - apps/api/src/lib/git.ts
    - apps/api/src/lib/github.ts
    - apps/api/src/agents/development.agent.ts
  modified:
    - apps/api/src/agents/base-agent.ts
    - apps/api/src/lib/config.ts
    - apps/api/src/queues/agent.queue.ts
    - packages/database/prisma/schema.prisma
    - packages/shared/src/schemas/agent.ts
    - packages/shared/src/types/index.ts
    - packages/shared/src/index.ts

key-decisions:
  - "Base agent tools/allowedTools dual usage: tools sets available tools, allowedTools auto-approves them -- both needed for bypassed permissions"
  - "Development output safeParse fallback: returns null instead of throwing when structured output fails, worker uses demand title as fallback commit message"
  - "CLAUDE_DEV_MODEL defaults to CLAUDE_MODEL value via local variable -- allows higher-capability model for development without breaking existing config"

patterns-established:
  - "Tool-enabled agent: allowedTools + tools arrays + maxTurns 50 + systemPrompt for code generation agents"
  - "Stateless git/github utilities: all functions accept repoPath/repoUrl, no singleton state"
  - "Rejection feedback loop: rejectionFeedback param in agent, testingFeedback + rejectionCount in Prisma"

# Metrics
duration: 11min
completed: 2026-02-12
---

# Phase 4 Plan 1: Dev/Testing Infrastructure Summary

**Git/GitHub utilities, tool-enabled base agent, development agent with 6 file system tools and rejection feedback loop**

## Performance

- **Duration:** 11 min
- **Started:** 2026-02-12T13:19:36Z
- **Completed:** 2026-02-12T13:30:44Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments
- Git operations wrapper (createIsolatedBranch, commitAndPush, resetWorkingDir, validateGitRepo) using simple-git
- GitHub PR creation wrapper (createPullRequest, extractOwnerRepo) using @octokit/rest
- Base agent extended with allowedTools, maxTurns, systemPrompt, model while maintaining backward compatibility
- Development agent implemented as pure function: reads DB, builds prompt with plan+requirements+rejection feedback, invokes Claude with file system tools
- Development and testing output Zod schemas with full type exports
- Prisma schema updated with rejectionCount and testingFeedback for the rejection feedback loop

## Task Commits

Each task was committed atomically:

1. **Task 1: Install deps, config, Prisma schema, shared schemas/types** - `ceb91fe` (chore)
2. **Task 2: Git utility, GitHub utility, and base agent extension** - `0a0416f` (feat)
3. **Task 3: Development agent implementation** - `4dec32b` (feat)

## Files Created/Modified
- `apps/api/src/lib/git.ts` - Git operations wrapper using simple-git (branch, commit, push, reset, validate)
- `apps/api/src/lib/github.ts` - GitHub API wrapper using @octokit/rest (PR creation, owner/repo extraction)
- `apps/api/src/agents/development.agent.ts` - Development phase agent with 6 file system tools and 50 maxTurns
- `apps/api/src/agents/base-agent.ts` - Extended with optional allowedTools, maxTurns, systemPrompt, model params
- `apps/api/src/lib/config.ts` - Added GITHUB_TOKEN and CLAUDE_DEV_MODEL config vars
- `apps/api/src/queues/agent.queue.ts` - AgentJobData phase union extended with development and testing
- `packages/database/prisma/schema.prisma` - Added rejectionCount and testingFeedback to Demand model
- `packages/shared/src/schemas/agent.ts` - Added developmentOutputSchema and testingOutputSchema with types
- `packages/shared/src/types/index.ts` - Added rejectionCount and testingFeedback to Demand interface
- `packages/shared/src/index.ts` - Added exports for new schemas and types
- `apps/api/package.json` - Added simple-git and @octokit/rest dependencies

## Decisions Made
- **Base agent tools/allowedTools dual usage:** SDK has `tools` (which tools are available) and `allowedTools` (which tools auto-approve without permission prompts). Development agent needs both to work with bypassPermissions mode.
- **Development output safeParse fallback:** Complex code generation may exhaust turns before structured output is complete. Using `safeParse` and returning null lets the worker gracefully fall back to using the demand title as commit message.
- **CLAUDE_DEV_MODEL via local variable:** Defined `claudeModel` before the config object so CLAUDE_DEV_MODEL can default to the same value as CLAUDE_MODEL without circular reference.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. GITHUB_TOKEN is optional (same pattern as ANTHROPIC_API_KEY -- only needed at worker runtime).

## Next Phase Readiness
- Git, GitHub, and base agent infrastructure ready for Plan 04-02 (testing agent + worker handlers)
- Development agent ready to be invoked by worker with development phase handling
- Shared schemas ready for worker to validate and store agent outputs
- Rejection feedback loop fields ready for testing agent retry logic

## Self-Check: PASSED

- All 11 files verified present on disk
- All 3 task commits verified in git log (ceb91fe, 0a0416f, 4dec32b)
- TypeScript compilation clean for apps/api and packages/shared

---
*Phase: 04-dev-testing*
*Completed: 2026-02-12*
