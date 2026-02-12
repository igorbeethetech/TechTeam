---
phase: 04-dev-testing
plan: 02
subsystem: agent-pipeline
tags: [testing-agent, rejection-loop, code-review, bullmq-worker, github-pr, git-branch]

# Dependency graph
requires:
  - phase: 04-dev-testing/01
    provides: "Git/GitHub utilities, base agent with tools, development agent, shared schemas, Prisma rejection fields"
provides:
  - "Testing agent with read-only review and structured verdict output"
  - "Development phase handler: repo validation, branch management, dev agent invocation, commit/push, PR creation"
  - "Testing phase handler: test agent invocation, approval/rejection logic"
  - "Rejection feedback loop: max 3 cycles before pausing for human review"
  - "Auto-enqueue development job after planning completes"
  - "Manual development stage trigger from demand route"
affects: [04-dev-testing/03]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Handler function extraction for complex phase logic", "Rejection feedback loop with MAX_REJECTION_CYCLES constant", "buildPrBody helper for structured PR markdown"]

key-files:
  created:
    - apps/api/src/agents/testing.agent.ts
  modified:
    - apps/api/src/queues/agent.worker.ts
    - apps/api/src/routes/demands.ts

key-decisions:
  - "Development/testing handlers extracted as separate async functions rather than inline in if/else chain -- keeps the main worker callback readable"
  - "Development handler returns early from worker callback with minimal result -- handler manages its own AgentRun/Demand updates internally"
  - "Testing agent uses strict parse (not safeParse) since review output is simpler than code generation output"

patterns-established:
  - "Handler extraction: complex phase logic in dedicated async functions receiving a context object"
  - "Branch naming convention: demand/{demandId}-{title-slug} with 50-char slug limit"
  - "PR body generation: helper function composes markdown from demand plan/requirements and agent output"

# Metrics
duration: 3min
completed: 2026-02-12
---

# Phase 4 Plan 2: Testing Agent and Worker Handlers Summary

**Testing agent with read-only code review, full development/testing worker handlers, rejection feedback loop (max 3 cycles), and auto-pipeline from planning through merge**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-12T13:33:33Z
- **Completed:** 2026-02-12T13:36:46Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Testing agent implemented as pure function: reads demand+project, builds review prompt with diff/test/plan comparison instructions, invokes Claude with read-only tools (Read/Glob/Grep/Bash), returns structured TestingOutput with verdict
- Worker extended with development handler: validates git repo, creates/checkouts branch, invokes dev agent with rejection feedback, commits/pushes changes, creates GitHub PR, advances to testing
- Worker extended with testing handler: invokes testing agent, approves (advance to merge) or rejects (return to development with feedback, pauses after 3 cycles)
- Planning handler now auto-enqueues development job (was previously parked for Phase 4)
- Demand route triggers development job on manual stage change to development

## Task Commits

Each task was committed atomically:

1. **Task 1: Testing agent implementation** - `495fdde` (feat)
2. **Task 2: Worker development/testing handlers, rejection loop, and demand stage trigger** - `28b4365` (feat)

## Files Created/Modified
- `apps/api/src/agents/testing.agent.ts` - Testing phase agent: reads DB, builds review prompt, invokes Claude with read-only + Bash tools, returns structured verdict
- `apps/api/src/queues/agent.worker.ts` - Extended with development/testing handlers, rejection loop, auto-enqueue from planning, buildPrBody helper, PHASE_TIMEOUTS for all 4 phases
- `apps/api/src/routes/demands.ts` - Added development stage trigger alongside existing discovery trigger

## Decisions Made
- **Handler extraction pattern:** Development and testing phase logic extracted into dedicated `handleDevelopmentPhase` and `handleTestingPhase` async functions rather than inlining in the if/else chain. The main worker callback was getting too complex with 4 phases.
- **Early return from worker callback:** Development/testing handlers manage their own AgentRun updates and Demand writes internally, then the worker callback returns a minimal result. This avoids duplicating the "update AgentRun + accumulate tokens" logic that exists for discovery/planning.
- **Strict parse for testing output:** Testing agent uses `testingOutputSchema.parse()` (throws on failure) unlike development agent which uses `safeParse` (graceful fallback). Testing output is simpler and more reliable -- a code review verdict vs complex code generation.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. GITHUB_TOKEN is already configured as optionalEnv (only needed at worker runtime).

## Next Phase Readiness
- Full pipeline flow complete: Discovery -> Planning -> Development -> Testing -> Merge (or reject -> retry)
- Ready for Plan 04-03 (remaining dev/testing polish or UI integration)
- Worker handles all 4 phases with proper error handling and stage advancement
- Rejection feedback loop tested with MAX_REJECTION_CYCLES=3

## Self-Check: PASSED

- All 3 files verified present on disk
- All 2 task commits verified in git log (495fdde, 28b4365)
- TypeScript compilation clean for apps/api and packages/shared
