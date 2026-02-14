---
phase: 08-websocket-realtime
plan: 02
subsystem: api
tags: [redis, pubsub, websocket, bullmq, worker, event-emission]

# Dependency graph
requires:
  - phase: 08-websocket-realtime plan 01
    provides: publishWsEvent helper, WsEvent shared type, Redis PubSub publisher connection
provides:
  - Agent worker emits Redis PubSub events after every observable state mutation
  - Merge worker emits Redis PubSub events after every observable state mutation
  - 31 total emission points across both workers covering all demand lifecycle events
affects: [08-websocket-realtime plan 03, frontend real-time updates]

# Tech tracking
tech-stack:
  added: []
  patterns: [emitEvent fire-and-forget wrapper with double try/catch safety]

key-files:
  modified:
    - apps/api/src/queues/agent.worker.ts
    - apps/api/src/queues/merge.worker.ts

key-decisions:
  - "emitEvent double-safety wrapper pattern: publishWsEvent already catches errors internally, but each call site is also wrapped to guarantee worker stability"
  - "Events published AFTER Prisma call resolves (never before, never in .then()) to prevent race conditions where frontend refetches stale data"

patterns-established:
  - "emitEvent wrapper: all worker WS event emissions go through emitEvent() for double try/catch safety"
  - "Event AFTER mutation: publishWsEvent always comes on the line immediately after the Prisma call it corresponds to"

# Metrics
duration: 5min
completed: 2026-02-14
---

# Phase 8 Plan 2: Worker Event Emission Summary

**Redis PubSub event emission added to agent.worker.ts (18 points) and merge.worker.ts (13 points) covering all observable state mutations with fire-and-forget safety wrapper**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-14T17:42:39Z
- **Completed:** 2026-02-14T17:48:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Agent worker publishes WsEvents after every Prisma mutation that changes demand stage, agentStatus, agent runs, or notifications (18 emission points)
- Merge worker publishes WsEvents after every Prisma mutation that changes mergeStatus, demand stage, agent runs, or notifications (13 emission points)
- All emissions use emitEvent() fire-and-forget wrapper with double try/catch (publishWsEvent internal catch + emitEvent outer catch)
- All events published AFTER Prisma calls resolve to prevent race conditions

## Task Commits

Each task was committed atomically:

1. **Task 1: Add publishWsEvent calls to agent.worker.ts** - `ba08558` (feat)
2. **Task 2: Add publishWsEvent calls to merge.worker.ts** - `93bbeec` (feat)

## Files Created/Modified
- `apps/api/src/queues/agent.worker.ts` - Added import of publishWsEvent, emitEvent wrapper, and 17 event emission points after all state-mutating Prisma calls
- `apps/api/src/queues/merge.worker.ts` - Added import of publishWsEvent, emitEvent wrapper, and 13 event emission points after all state-mutating Prisma calls

## Event Coverage

### agent.worker.ts (17 emission points)

| Location | Event Type | Trigger |
|----------|-----------|---------|
| Main handler | agent-run:updated | AgentRun created (running) |
| Main handler | agent-run:updated | AgentRun completed |
| Main handler | agent:status-changed | Demand agentStatus cleared |
| Main handler | demand:updated | Discovery requirements stored |
| Main handler | agent:status-changed | Discovery paused (ambiguities) |
| Main handler | demand:stage-changed | Discovery -> planning |
| Main handler | demand:stage-changed | Planning -> development |
| Main handler | demand:updated | Plan stored on demand |
| Main handler | agent-run:updated | AgentRun failed/timeout |
| Main handler | agent:status-changed | Demand agentStatus failed |
| Main handler | notification:created | Agent failure notification |
| handleDevelopmentPhase | agent:status-changed | Dev slot full, re-queued |
| handleDevelopmentPhase | agent-run:updated | Development AgentRun completed |
| handleDevelopmentPhase | demand:stage-changed | Development -> testing |
| handleTestingPhase | agent-run:updated | Testing AgentRun completed |
| handleTestingPhase | demand:stage-changed | Testing -> merge |
| handleTestingPhase | agent:status-changed | Testing paused (max rejections) |
| handleTestingPhase | demand:stage-changed | Testing rejected -> development |

### merge.worker.ts (13 emission points)

| Location | Event Type | Trigger |
|----------|-----------|---------|
| processMergeJob | demand:updated | Merge started (pending) |
| Step 1 success | demand:stage-changed | Merged, stage -> done |
| Step 1 success | notification:created | Demand done notification |
| Step 2 start | demand:updated | Status -> conflict_resolving |
| Step 2 start | agent-run:updated | Merge-resolver AgentRun created |
| Step 2 | agent-run:updated | Merge-resolver AgentRun completed/failed |
| Step 2 success | demand:stage-changed | AI resolved, stage -> done |
| Step 2 success | notification:created | Demand done notification |
| Step 2 edge case | agent-run:updated | No conflicted files, run failed |
| Step 3 | demand:updated | Status -> needs_human |
| Step 3 | notification:created | Merge needs attention notification |
| Error handler | demand:updated | Error, status -> needs_human |
| Error handler | notification:created | Merge failure notification |

## Decisions Made
- Used emitEvent double-safety wrapper pattern: publishWsEvent already catches errors internally, but each call site is also wrapped via emitEvent() to guarantee no worker crash under any circumstance
- Events published AFTER Prisma call resolves (not before, not in .then()) to prevent the race condition where frontend refetches before DB commit

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Both workers now emit Redis PubSub events for all observable state changes
- When combined with Plan 01's WebSocket server infrastructure, events flow from workers -> Redis PubSub -> API server -> WebSocket clients
- Plan 03 (frontend WebSocket hook + TanStack Query invalidation) can now wire up the client side to receive and act on these events

## Self-Check: PASSED

- [x] agent.worker.ts exists with 18 emitEvent calls
- [x] merge.worker.ts exists with 13 emitEvent calls
- [x] Commit ba08558 exists (agent worker)
- [x] Commit 93bbeec exists (merge worker)
- [x] 08-02-SUMMARY.md exists
- [x] TypeScript compilation passes (tsc --noEmit)
- [x] Monorepo build passes (pnpm build)

---
*Phase: 08-websocket-realtime*
*Completed: 2026-02-14*
