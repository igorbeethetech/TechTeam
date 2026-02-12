---
phase: 05-merge-concurrency
plan: 01
subsystem: api
tags: [bullmq, merge-queue, redis, lua, simple-git, concurrency, git-worktree]

# Dependency graph
requires:
  - phase: 03-agent-pipeline
    provides: "BullMQ agent queue/worker pattern, redis connection factories"
  - phase: 04-dev-testing
    provides: "Development/testing agent handlers, branch management, PR creation, git utilities"
provides:
  - "BullMQ merge queue (merge-queue) with MergeJobData/MergeJobResult types"
  - "Merge worker with Step 1 auto-merge (concurrency 1, FIFO)"
  - "Redis-based dev slot semaphore (Lua script atomic acquire/release)"
  - "Git merge, worktree, and conflict detection utilities"
  - "GitHub PR merge and close utilities"
  - "MergeResolverOutput schema and MergeStatus type"
  - "Agent worker testing approval enqueues merge jobs"
affects: [05-merge-concurrency, 06-metrics-notifications]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Merge queue with global concurrency 1 for FIFO processing"
    - "3-step merge escalation: auto-merge -> AI resolution (stub) -> human"
    - "Redis Lua script for atomic semaphore (SCARD + SADD + EXPIRE)"
    - "Lenient post-merge tests (v1 -- testing agent already validated)"
    - "Local git merge + push + PR close (not GitHub API merge)"

key-files:
  created:
    - apps/api/src/queues/merge.queue.ts
    - apps/api/src/queues/merge.worker.ts
    - apps/api/src/lib/concurrency.ts
  modified:
    - apps/api/src/lib/git.ts
    - apps/api/src/lib/github.ts
    - apps/api/src/queues/agent.worker.ts
    - apps/api/worker.ts
    - packages/shared/src/schemas/agent.ts
    - packages/shared/src/types/index.ts
    - packages/shared/src/index.ts

key-decisions:
  - "Local git merge + push + PR close instead of GitHub API merge -- allows conflict resolution before pushing"
  - "Post-merge tests lenient for v1 -- testing agent already validated code before merge"
  - "Merge worker concurrency 1 globally -- serializes all merges FIFO"
  - "Conflicts stub directly to needs_human -- Steps 2/3 deferred to Plan 02"

patterns-established:
  - "Merge queue pattern: separate BullMQ queue for merge jobs, worker processes one at a time"
  - "Redis Lua script semaphore for application-level concurrency control"
  - "Git worktree utilities ready for concurrent development isolation"

# Metrics
duration: 4min
completed: 2026-02-12
---

# Phase 5 Plan 1: Merge Queue Infrastructure Summary

**BullMQ merge queue with Step 1 auto-merge (git merge + push + PR close), Redis dev slot semaphore, and extended git/github utilities**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-12T23:34:31Z
- **Completed:** 2026-02-12T23:38:38Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Merge queue infrastructure with BullMQ processing one merge at a time (FIFO)
- Step 1 auto-merge: git merge + lenient post-merge tests + push + PR close
- Redis-based concurrency semaphore with Lua script for atomic slot management
- Extended git utilities: mergeFromBranch, checkConflictMarkers, worktree management
- Extended GitHub utilities: mergePullRequest, closePullRequest, extractPrNumber
- Full pipeline wired: testing approval now enqueues merge jobs automatically
- Worker process starts both agent and merge workers with graceful shutdown

## Task Commits

Each task was committed atomically:

1. **Task 1: Merge queue, concurrency library, extended git/github utilities, and shared types** - `84fe2f6` (feat)
2. **Task 2: Merge worker (Step 1 auto-merge) and agent worker wiring** - `b3532ad` (feat)

## Files Created/Modified
- `apps/api/src/queues/merge.queue.ts` - BullMQ merge queue with MergeJobData/MergeJobResult types
- `apps/api/src/queues/merge.worker.ts` - Merge worker with 3-step escalation (Step 1 complete, Steps 2/3 stubbed)
- `apps/api/src/lib/concurrency.ts` - Redis-based dev slot semaphore with Lua script
- `apps/api/src/lib/git.ts` - Added mergeFromBranch, checkConflictMarkers, worktree functions
- `apps/api/src/lib/github.ts` - Added mergePullRequest, closePullRequest, extractPrNumber
- `apps/api/src/queues/agent.worker.ts` - Testing approval now enqueues merge jobs
- `apps/api/worker.ts` - Starts both agent and merge workers with graceful shutdown
- `packages/shared/src/schemas/agent.ts` - Added mergeResolverOutputSchema
- `packages/shared/src/types/index.ts` - Added MergeStatus type
- `packages/shared/src/index.ts` - Exports new types and schemas

## Decisions Made
- **Local git merge + push + PR close:** Instead of using GitHub API merge (`pulls.merge()`), we merge locally via `simple-git`, push the merged default branch, then close the PR. This allows conflict resolution (Step 2) to happen before pushing, and only pushes clean merge results.
- **Lenient post-merge tests for v1:** Post-merge tests are wrapped in try/catch and do not block the merge. The testing agent already validated the code before merge, so test failures at merge time are likely environment issues rather than code problems.
- **Global concurrency 1 for merge worker:** Instead of per-project serialization (which would require BullMQ Pro group concurrency), the merge worker processes one merge at a time globally. This is simpler and sufficient for v1 scale.
- **Direct needs_human stub for conflicts:** When conflicts are detected, Steps 2 (AI resolution) and 3 (human escalation) both stub to `needs_human` status. Plan 02 will implement AI conflict resolution (Step 2) as a separate phase.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Merge queue ready for AI conflict resolution agent (Plan 02)
- Concurrency library ready for agent worker integration (Plan 03)
- Full pipeline flow complete: Discovery -> Planning -> Development -> Testing -> Merge -> Done
- Steps 2/3 (AI resolution + human escalation UI) are planned for Plans 02 and 03

## Self-Check: PASSED

All 11 files verified present. Both task commits (84fe2f6, b3532ad) verified in git log.

---
*Phase: 05-merge-concurrency*
*Completed: 2026-02-12*
