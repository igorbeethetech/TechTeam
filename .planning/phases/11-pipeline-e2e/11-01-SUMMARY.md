---
phase: 11-pipeline-e2e
plan: 01
subsystem: api
tags: [git, github, simple-git, authentication, push, token-injection]

# Dependency graph
requires:
  - phase: 03-agent-pipeline
    provides: "agent.worker.ts handleDevelopmentPhase, merge.worker.ts processMergeJob"
  - phase: 05-merge-concurrency
    provides: "merge.worker.ts 3-step escalation with auto-merge and AI resolution"
provides:
  - "injectGitToken() and restoreGitRemote() git helper functions"
  - "Authenticated git push in Development phase (agent.worker.ts)"
  - "Authenticated git push in Merge phase Step 1 and Step 2 (merge.worker.ts)"
  - "Tenant GitHub token passed to closePullRequest in merge worker"
affects: [11-pipeline-e2e]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Token injection pattern: injectGitToken before push, restoreGitRemote in finally"
    - "URL regex parsing inline to avoid circular deps with github.ts"

key-files:
  created: []
  modified:
    - apps/api/src/lib/git.ts
    - apps/api/src/queues/agent.worker.ts
    - apps/api/src/queues/merge.worker.ts

key-decisions:
  - "Inline URL regex in git.ts to avoid circular dependency with github.ts"
  - "Token URL format uses x-access-token protocol for GitHub App-style auth"
  - "Always restore original remote URL in finally block to prevent token leakage"

patterns-established:
  - "Token injection pattern: inject before push, restore in finally -- use for any future git push operations"

# Metrics
duration: 3min
completed: 2026-03-01
---

# Phase 11 Plan 01: Git Push Authentication Summary

**Token injection into git remote URLs for authenticated push in Development and Merge phases, with tenant-scoped GitHub token for PR close operations**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-01T19:19:40Z
- **Completed:** 2026-03-01T19:22:15Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added `injectGitToken()` and `restoreGitRemote()` to `git.ts` for authenticated git push operations
- Wired token injection into `handleDevelopmentPhase` in `agent.worker.ts` with try/finally for safe restoration
- Wired token injection into both push operations in `merge.worker.ts` (Step 1 auto-merge and Step 2 AI resolution)
- Fixed `closePullRequest` calls in merge worker to pass tenant GitHub token instead of relying on env fallback

## Task Commits

Each task was committed atomically:

1. **Task 1: Add git token injection helpers and wire into Development handler** - `d69dac8` (feat)
2. **Task 2: Wire git token injection and tenant token into Merge worker** - `4a6feca` (feat)

**Plan metadata:** [pending] (docs: complete plan)

## Files Created/Modified
- `apps/api/src/lib/git.ts` - Added injectGitToken() and restoreGitRemote() exported functions
- `apps/api/src/queues/agent.worker.ts` - Token injection before commitAndPush with finally restore
- `apps/api/src/queues/merge.worker.ts` - Token injection before both push operations, tenant token for closePullRequest

## Decisions Made
- Inline URL regex (`github\.com[/:]([^/]+)/([^/.]+)`) in git.ts to parse owner/repo without importing from github.ts, avoiding circular dependencies
- Used `x-access-token` protocol in token URL format (`https://x-access-token:{token}@github.com/{owner}/{repo}.git`) which works with both GitHub PATs and GitHub App installation tokens
- Always restore original remote URL in a `finally` block to prevent token from persisting in git config or appearing in logs

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript errors in unrelated files (bee-ai.ts, clients.ts, meetings.ts, stickies.ts, reqs-projects.ts) from uncommitted Prisma schema changes outside this plan's scope. These do not affect the modified files which compile cleanly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Git push authentication is now wired for both Development and Merge phases
- Plan 11-02 (E2E pipeline testing) can proceed with confidence that push operations will authenticate correctly
- Remaining concern from research: Claude CLI subprocess ENOENT spawn errors in Docker -- to be validated during E2E testing

## Self-Check: PASSED

- All 3 modified files exist on disk
- Both task commits verified (d69dac8, 4a6feca)
- SUMMARY.md created at expected path

---
*Phase: 11-pipeline-e2e*
*Completed: 2026-03-01*
