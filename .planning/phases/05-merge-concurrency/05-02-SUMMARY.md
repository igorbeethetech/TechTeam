---
phase: 05-merge-concurrency
plan: 02
subsystem: api
tags: [claude-agent-sdk, merge-resolver, conflict-resolution, bullmq, fastify, prisma]

# Dependency graph
requires:
  - phase: 05-merge-concurrency
    plan: 01
    provides: "Merge queue, Step 1 auto-merge, git/github utilities, mergeResolverOutputSchema"
  - phase: 03-agent-pipeline
    provides: "Base agent execution wrapper (executeAgent), pure agent function pattern"
  - phase: 04-dev-testing
    provides: "Development agent pattern reference, CLAUDE_DEV_MODEL config"
provides:
  - "Merge-resolver agent for AI semantic conflict resolution (runMergeResolverAgent)"
  - "Full 3-step merge escalation in merge worker (auto-merge -> AI resolution -> human)"
  - "POST /api/demands/:id/merge/retry endpoint for re-enqueuing after human resolution"
  - "GET /api/demands/:id/merge/status endpoint for dashboard merge context"
  - "Manual merge stage trigger from demands PATCH /:id/stage"
  - "Prisma namespace export from database package (for Prisma.DbNull)"
affects: [05-merge-concurrency, 06-metrics-notifications]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "AI conflict resolution via Claude agent with structured output validation"
    - "Post-resolution verification: git status + conflict marker check before commit"
    - "Clean repo reset on AI failure: merge --abort + hard reset to origin"
    - "Prisma.DbNull for clearing JSON fields in update operations"

key-files:
  created:
    - apps/api/src/agents/merge-resolver.agent.ts
    - apps/api/src/routes/merge.ts
  modified:
    - apps/api/src/queues/merge.worker.ts
    - apps/api/src/routes/demands.ts
    - apps/api/src/server.ts
    - packages/database/src/client.ts
    - packages/database/src/index.ts

key-decisions:
  - "Merge-resolver uses CLAUDE_DEV_MODEL for code understanding quality"
  - "30 max turns for conflict resolution -- bounded scope unlike open-ended development"
  - "Double verification after AI resolution: git status conflicted check + conflict marker grep"
  - "Prisma namespace exported from database package to enable Prisma.DbNull for JSON null clearing"

patterns-established:
  - "AI conflict resolution: re-merge to leave markers, invoke agent, verify clean, commit+push"
  - "Merge API route pattern: state guards (needs_human + merge stage) before retry"

# Metrics
duration: 5min
completed: 2026-02-12
---

# Phase 5 Plan 2: AI Conflict Resolution and Merge API Summary

**Merge-resolver agent using Claude for semantic conflict resolution, full 3-step merge escalation, and REST endpoints for merge retry/status**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-12T14:41:30Z
- **Completed:** 2026-02-12T14:46:28Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Merge-resolver agent reads conflict markers and resolves them semantically via Claude
- Full 3-step merge escalation: auto-merge -> AI resolution with AgentRun tracking -> human escalation with conflict context
- POST /api/demands/:id/merge/retry re-enqueues merge for human-resolved conflicts
- GET /api/demands/:id/merge/status provides merge context for dashboard display
- Manual stage-to-merge trigger from demands route enqueues merge jobs

## Task Commits

Each task was committed atomically:

1. **Task 1: Merge-resolver agent and full 3-step merge worker** - `5610215` (feat)
2. **Task 2: Merge API routes, merge stage trigger, and server registration** - `da88c73` (feat)

## Files Created/Modified
- `apps/api/src/agents/merge-resolver.agent.ts` - Pure agent function that builds conflict resolution prompt, calls Claude, returns parsed result
- `apps/api/src/queues/merge.worker.ts` - Full 3-step merge escalation with AgentRun tracking and cost accumulation
- `apps/api/src/routes/merge.ts` - POST retry and GET status endpoints for merge operations
- `apps/api/src/routes/demands.ts` - Added merge stage trigger to enqueue merge jobs on manual stage change
- `apps/api/src/server.ts` - Registered merge routes in protected scope
- `packages/database/src/client.ts` - Exported Prisma namespace for DbNull usage
- `packages/database/src/index.ts` - Re-exported Prisma namespace from database package

## Decisions Made
- **CLAUDE_DEV_MODEL for merge resolution:** The merge-resolver uses the development model (not the default model) because resolving merge conflicts requires the same level of code understanding as development.
- **30 max turns for conflict resolution:** Unlike development (50 turns), conflict resolution is bounded -- read files, resolve markers, stage. 30 turns is generous but bounded.
- **Double verification after AI resolution:** Both `git status` conflicted check AND `checkConflictMarkers()` (grep for <<<<<<< markers) must pass before committing. This prevents partially resolved files from being pushed.
- **Prisma namespace export:** The `Prisma` namespace was not previously exported from the database package. Added it to enable `Prisma.DbNull` for clearing JSON fields (mergeConflicts) in the retry endpoint.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Demand cost accumulation field names**
- **Found during:** Task 1 (merge worker implementation)
- **Issue:** Plan referenced `totalTokensIn`/`totalTokensOut` but Prisma schema has single `totalTokens` field
- **Fix:** Changed to `totalTokens: { increment: tokensIn + tokensOut }` matching existing agent worker pattern
- **Files modified:** apps/api/src/queues/merge.worker.ts
- **Verification:** TypeScript compilation passes
- **Committed in:** 5610215 (Task 1 commit)

**2. [Rule 1 - Bug] Added missing tenantId to AgentRun create**
- **Found during:** Task 1 (merge worker implementation)
- **Issue:** AgentRun.create missing required `tenantId` field per Prisma schema
- **Fix:** Added `tenantId` from job data to AgentRun create call
- **Files modified:** apps/api/src/queues/merge.worker.ts
- **Verification:** TypeScript compilation passes
- **Committed in:** 5610215 (Task 1 commit)

**3. [Rule 3 - Blocking] Exported Prisma namespace from database package**
- **Found during:** Task 2 (merge routes implementation)
- **Issue:** `Prisma.DbNull` needed to clear JSON field but Prisma namespace not exported from @techteam/database
- **Fix:** Added Prisma import/export in database package client.ts and index.ts
- **Files modified:** packages/database/src/client.ts, packages/database/src/index.ts
- **Verification:** TypeScript compilation passes for both database and api packages
- **Committed in:** da88c73 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep.

## Issues Encountered

None beyond the auto-fixed deviations above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Full 3-step merge pipeline operational: auto-merge -> AI resolution -> human escalation
- Merge retry and status endpoints ready for Plan 03 dashboard integration
- Concurrency controls (dev slot semaphore from Plan 01) ready for Plan 03 integration
- Pipeline flow complete: Discovery -> Planning -> Development -> Testing -> Merge (with AI conflict resolution) -> Done

## Self-Check: PASSED

All 7 files verified present. Both task commits (5610215, da88c73) verified in git log.

---
*Phase: 05-merge-concurrency*
*Completed: 2026-02-12*
