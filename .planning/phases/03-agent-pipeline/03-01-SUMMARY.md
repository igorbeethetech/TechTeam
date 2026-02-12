---
phase: 03-agent-pipeline
plan: 01
subsystem: api, database, infra
tags: [bullmq, ioredis, claude-agent-sdk, redis, prisma, worker, queue]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: Prisma schema, tenant isolation, Fastify API, Redis in Docker Compose
  - phase: 02-kanban-demands
    provides: Demand model, stage update API, Kanban board
provides:
  - AgentRun Prisma model with tenant isolation for tracking agent executions
  - BullMQ agent-pipeline queue with exponential backoff retry
  - Redis connection factory with separate Queue/Worker connections
  - Base agent wrapper integrating Claude Agent SDK with timeout and cost tracking
  - BullMQ worker process with tenant-scoped database writes and stage advancement
  - Agent-runs REST API endpoint (GET /api/agent-runs?demandId=)
  - Automatic job enqueue on demand stage change to discovery
  - Stub discovery/planning agent files for TypeScript compilation
affects: [03-agent-pipeline, 04-dev-testing]

# Tech tracking
tech-stack:
  added: [bullmq ^5.68.0, "@anthropic-ai/claude-agent-sdk ^0.2.39", ioredis ^5.9.2]
  patterns: [BullMQ worker process, Redis connection factory, Claude SDK query() with structured output, tenant isolation in workers via forTenant()]

key-files:
  created:
    - apps/api/src/lib/redis.ts
    - apps/api/src/queues/agent.queue.ts
    - apps/api/src/queues/agent.worker.ts
    - apps/api/src/agents/base-agent.ts
    - apps/api/src/agents/discovery.agent.ts
    - apps/api/src/agents/planning.agent.ts
    - apps/api/src/routes/agent-runs.ts
    - apps/api/worker.ts
    - packages/shared/src/schemas/agent.ts
  modified:
    - packages/database/prisma/schema.prisma
    - packages/database/src/tenant.ts
    - packages/shared/src/types/index.ts
    - packages/shared/src/index.ts
    - apps/api/src/lib/config.ts
    - apps/api/src/routes/demands.ts
    - apps/api/src/server.ts
    - apps/api/package.json
    - docker-compose.yml

key-decisions:
  - "ANTHROPIC_API_KEY as optionalEnv instead of requireEnv -- prevents API server crash when key not set (only worker needs it)"
  - "Stub agent files for discovery/planning -- allows TypeScript compilation while deferring implementation to Plans 02/03"
  - "Worker concurrency set to 2 -- balance between throughput and API rate limits per research recommendation"
  - "Separate Redis connections for Queue and Worker -- maxRetriesPerRequest: null required for Worker blocking commands"

patterns-established:
  - "Redis connection factory: createQueueConnection() vs createWorkerConnection() with null maxRetriesPerRequest"
  - "BullMQ worker error handler: always attach worker.on('error') immediately after creation"
  - "Agent execution wrapper: AbortController timeout, structured output, cost tracking from SDK result"
  - "Queue trigger pattern: demand stage change to discovery enqueues job + sets agentStatus to queued"
  - "Worker tenant isolation: forTenant(tenantId) from job data for all database operations"

# Metrics
duration: 8min
completed: 2026-02-12
---

# Phase 3 Plan 01: Agent Pipeline Infrastructure Summary

**BullMQ queue with exponential backoff, Claude Agent SDK base wrapper, AgentRun tracking model, and worker process with tenant-isolated stage advancement**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-12T04:20:12Z
- **Completed:** 2026-02-12T04:28:10Z
- **Tasks:** 3
- **Files modified:** 18

## Accomplishments
- AgentRun model in PostgreSQL with 14 columns, tenant isolation indexes, and Demand relation
- BullMQ agent-pipeline queue with 3-attempt exponential backoff (1s, 2s, 4s) and job retention
- Worker process runs independently with graceful shutdown, connects to Redis, handles retries and timeouts
- Base agent wrapper provides Claude SDK integration with AbortController timeout and cost/token tracking
- Demand stage change to "discovery" automatically enqueues BullMQ job and sets agentStatus to "queued"
- Agent-runs API endpoint returns tenant-scoped run history filtered by demandId
- Redis noeviction policy prevents BullMQ key eviction under memory pressure

## Task Commits

Each task was committed atomically:

1. **Task 1: AgentRun schema, shared output types, and database migration** - `25c1b81` (feat)
2. **Task 2: Redis factory, BullMQ queue, and install dependencies** - `6a80341` (feat)
3. **Task 3: Worker process, base agent wrapper, agent-runs API, and demand stage trigger** - `1d0cc77` (feat)

## Files Created/Modified
- `packages/database/prisma/schema.prisma` - Added AgentStatus enum, AgentRun model, agentStatus field on Demand
- `packages/database/src/tenant.ts` - Added "AgentRun" to TENANT_MODELS array
- `packages/shared/src/schemas/agent.ts` - Zod schemas for discovery and planning agent structured output
- `packages/shared/src/types/index.ts` - AgentStatus type, AgentRun interface, agentStatus on Demand interface
- `packages/shared/src/index.ts` - Exports for new agent schemas and types
- `apps/api/src/lib/config.ts` - Added ANTHROPIC_API_KEY and CLAUDE_MODEL config vars
- `apps/api/src/lib/redis.ts` - Redis connection factory for Queue (default) and Worker (null maxRetries)
- `apps/api/src/queues/agent.queue.ts` - BullMQ queue with AgentJobData/AgentJobResult types and retry config
- `apps/api/src/queues/agent.worker.ts` - Worker processor with tenant isolation, stage advancement, error handling
- `apps/api/src/agents/base-agent.ts` - Reusable agent wrapper with SDK query(), timeout, and cost tracking
- `apps/api/src/agents/discovery.agent.ts` - Stub for Plan 03-02 implementation
- `apps/api/src/agents/planning.agent.ts` - Stub for Plan 03-03 implementation
- `apps/api/src/routes/agent-runs.ts` - GET endpoint for listing agent runs by demandId
- `apps/api/src/routes/demands.ts` - Added agent queue trigger on stage change to discovery
- `apps/api/src/server.ts` - Registered agent-runs route in protected scope
- `apps/api/worker.ts` - Standalone worker entry point with graceful shutdown
- `apps/api/package.json` - Added bullmq, claude-agent-sdk, ioredis deps + dev:worker script
- `docker-compose.yml` - Added noeviction policy to Redis

## Decisions Made
- ANTHROPIC_API_KEY made optional in config (not required) so the API server can start without it. The worker validates at execution time. This prevents breaking the dev workflow when the key isn't set yet.
- Created stub files for discovery.agent.ts and planning.agent.ts so TypeScript compiles. These will be replaced with full implementations in Plans 02 and 03.
- Worker concurrency set to 2 per research recommendation -- balances throughput with Claude API rate limits.
- Redis connections separated: Queue uses default maxRetriesPerRequest, Worker uses null (required for BullMQ blocking commands).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ANTHROPIC_API_KEY as optionalEnv instead of requireEnv**
- **Found during:** Task 2 (config.ts update)
- **Issue:** Plan specified `requireEnv("ANTHROPIC_API_KEY")` which would crash the API server at startup when the key isn't set. Only the worker process needs this key.
- **Fix:** Changed to `optionalEnv("ANTHROPIC_API_KEY", "")` and added runtime validation in `base-agent.ts` executeAgent function
- **Files modified:** apps/api/src/lib/config.ts, apps/api/src/agents/base-agent.ts
- **Verification:** API server starts without ANTHROPIC_API_KEY set
- **Committed in:** 6a80341 (Task 2), 1d0cc77 (Task 3)

**2. [Rule 3 - Blocking] Created stub discovery/planning agent files**
- **Found during:** Task 3 (TypeScript compilation)
- **Issue:** Worker processor dynamically imports `discovery.agent.js` and `planning.agent.js` which don't exist until Plans 02/03. TypeScript fails with TS2307 module not found.
- **Fix:** Created stub files with correct export signatures that throw "not yet implemented" errors
- **Files modified:** apps/api/src/agents/discovery.agent.ts, apps/api/src/agents/planning.agent.ts
- **Verification:** `npx tsc --noEmit` passes cleanly
- **Committed in:** 1d0cc77 (Task 3)

**3. [Rule 1 - Bug] Non-null assertion on activeOrganizationId**
- **Found during:** Task 3 (TypeScript compilation)
- **Issue:** `request.session!.session.activeOrganizationId` is typed as `string | null` but BullMQ job data requires `string`. Since the tenant plugin already validates this is non-null, the assertion is safe.
- **Fix:** Added `!` non-null assertion operator
- **Files modified:** apps/api/src/routes/demands.ts
- **Verification:** TypeScript compiles without errors
- **Committed in:** 1d0cc77 (Task 3)

**4. [Rule 3 - Blocking] Prisma client regeneration after schema change**
- **Found during:** Task 3 (TypeScript compilation)
- **Issue:** After adding AgentRun to schema.prisma and running db push, the generated Prisma client was stale. TypeScript couldn't find `prisma.agentRun` or `agentStatus` field.
- **Fix:** Ran `npx prisma generate` to regenerate the client
- **Files modified:** packages/database/generated/prisma (auto-generated)
- **Verification:** All Prisma model types resolve correctly
- **Committed in:** 1d0cc77 (Task 3, implicitly via generated files)

---

**Total deviations:** 4 auto-fixed (2 bugs, 2 blocking)
**Impact on plan:** All auto-fixes necessary for correctness and compilation. No scope creep.

## Issues Encountered
None -- all issues were caught during compilation and fixed inline.

## User Setup Required

**ANTHROPIC_API_KEY is required for the worker to execute agents.** Add to `.env`:
```
ANTHROPIC_API_KEY=your-key-here
```
Get it from: https://console.anthropic.com/settings/keys

The API server works without this key. Only the worker process (`pnpm dev:worker`) needs it.

## Next Phase Readiness
- Queue and worker infrastructure ready for Plans 02 and 03 to implement actual agent logic
- Discovery agent stub ready to be replaced with full implementation (Plan 03-02)
- Planning agent stub ready to be replaced with full implementation (Plan 03-03)
- `ANTHROPIC_API_KEY` must be set in `.env` before running the worker

---
*Phase: 03-agent-pipeline*
*Completed: 2026-02-12*
