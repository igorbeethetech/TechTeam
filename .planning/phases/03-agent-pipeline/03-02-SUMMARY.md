---
phase: 03-agent-pipeline
plan: 02
subsystem: api, agents
tags: [claude-agent-sdk, zod, zod-to-json-schema, structured-output, prompt-engineering, discovery, planning]

# Dependency graph
requires:
  - phase: 03-agent-pipeline
    plan: 01
    provides: Base agent wrapper (executeAgent), BullMQ worker process, AgentRun model, agent queue
  - phase: 01-foundation
    provides: Prisma schema, Demand/Project models, @techteam/database raw prisma client
provides:
  - runDiscoveryAgent() - AI-powered requirements extraction with complexity and ambiguity detection
  - runPlanningAgent() - AI-powered task decomposition with file mappings and dependencies
  - Worker metric persistence - tokensIn/tokensOut/costUsd/durationMs saved to AgentRun and Demand
  - Worker output persistence - requirements/complexity (discovery) and plan (planning) saved to Demand
affects: [03-agent-pipeline, 04-dev-testing]

# Tech tracking
tech-stack:
  added: [zod-to-json-schema ^3.25.1]
  patterns: [Prompt builder function per agent, zodToJsonSchema for Zod v3 to JSON Schema conversion, pure agent function pattern (read context + call AI + return results)]

key-files:
  created:
    - apps/api/src/agents/discovery.agent.ts
    - apps/api/src/agents/planning.agent.ts
  modified:
    - apps/api/src/queues/agent.worker.ts
    - apps/api/package.json
    - pnpm-lock.yaml

key-decisions:
  - "zod-to-json-schema instead of z.toJSONSchema() -- Zod 3.25.x default export is v3 API where toJSONSchema doesn't exist; it's only in zod/v4 which is incompatible with v3 schemas"
  - "Worker now persists agent metrics (tokens, cost, duration) on AgentRun and accumulates totals on Demand -- was missing in 03-01 worker"
  - "Worker now stores requirements/complexity from discovery and plan from planning on Demand -- enables planning agent to read discovery output and UI to display results"
  - "Pure agent function pattern: agents read DB, call AI, return results; worker handles all side effects (DB writes, stage transitions, job chaining)"

patterns-established:
  - "Prompt builder function: buildDiscoveryPrompt(demand, project) / buildPlanningPrompt(demand, project, requirements) -- separates prompt construction from execution"
  - "Agent function signature: accepts {demandId, tenantId, projectId, timeout}, returns {output, metrics} -- consistent across all agents"
  - "zodToJsonSchema(schema) for converting Zod v3 schemas to JSON Schema for Claude SDK structured output"
  - "Raw prisma for agent reads (no tenant scope needed in trusted worker context), forTenant() only for writes in worker"

# Metrics
duration: 6min
completed: 2026-02-12
---

# Phase 3 Plan 02: Discovery and Planning Agents Summary

**Discovery agent analyzes demands into structured requirements with ambiguity detection, planning agent decomposes requirements into task plans with file mappings, both using Claude SDK structured JSON output via zod-to-json-schema**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-12T01:31:37Z
- **Completed:** 2026-02-12T01:37:10Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Discovery agent builds contextual prompt from demand description + project techStack/repoUrl and produces structured requirements JSON with complexity estimation (S/M/L/XL) and ambiguity detection
- Planning agent receives discovery requirements from demand.requirements and produces decomposed technical plan with tasks, files, dependencies, execution order, and risk areas
- Worker now persists full agent metrics (tokensIn, tokensOut, costUsd, durationMs) to AgentRun records and accumulates totals on Demand
- Worker now stores agent outputs on Demand (requirements/complexity for discovery, plan for planning) enabling downstream agents and UI display

## Task Commits

Each task was committed atomically:

1. **Task 1: Discovery agent with prompt builder, requirements extraction, and ambiguity detection** - `cff7868` (feat)
2. **Task 2: Planning agent with prompt builder, task decomposition, and file mapping** - `aa0aaa6` (feat)

## Files Created/Modified
- `apps/api/src/agents/discovery.agent.ts` - Discovery phase agent: builds prompt from demand+project, calls executeAgent with discoveryOutputSchema, returns structured requirements with ambiguity flag
- `apps/api/src/agents/planning.agent.ts` - Planning phase agent: builds prompt from demand+project+requirements, calls executeAgent with planningOutputSchema, returns structured task decomposition
- `apps/api/src/queues/agent.worker.ts` - Updated to persist token/cost metrics on AgentRun, accumulate totals on Demand, store requirements/plan output on Demand
- `apps/api/package.json` - Added zod and zod-to-json-schema as direct dependencies
- `pnpm-lock.yaml` - Updated lockfile

## Decisions Made
- Used `zod-to-json-schema` instead of `z.toJSONSchema()` because the shared schemas use Zod v3 API (default `import { z } from "zod"`) while `toJSONSchema` only exists in the `zod/v4` namespace which cannot convert v3 schemas. This is a stable, well-maintained library that bridges the gap.
- Added `zod` as direct dependency in the api package (was previously only a transitive dependency via @techteam/shared) since the agent files import from it directly for type inference.
- Updated the worker to persist agent metrics that were being returned but discarded -- AgentRun records now have real token counts and cost data, and Demand records accumulate totals across all agent runs.
- Updated the worker to store agent outputs on Demand fields (requirements, complexity, plan) so the planning agent can read discovery output and the UI can display results.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added zod and zod-to-json-schema dependencies**
- **Found during:** Task 1 (TypeScript compilation)
- **Issue:** Plan specified `import { z } from "zod"` and `z.toJSONSchema()` but zod was not a direct dependency of @techteam/api, and `z.toJSONSchema()` doesn't exist on the v3 API (only in `zod/v4` namespace which is incompatible with v3 schemas)
- **Fix:** Added `zod` and `zod-to-json-schema` as direct dependencies, used `zodToJsonSchema()` instead
- **Files modified:** apps/api/package.json, pnpm-lock.yaml, apps/api/src/agents/discovery.agent.ts
- **Verification:** `npx tsc --noEmit` passes, module exports correctly
- **Committed in:** cff7868 (Task 1)

**2. [Rule 2 - Missing Critical] Worker not persisting agent metrics or outputs**
- **Found during:** Task 2 (reviewing worker integration)
- **Issue:** Worker from Plan 03-01 created AgentRun with status and output but discarded tokensIn/tokensOut/costUsd/durationMs. Also did not store requirements/plan on Demand model, which is needed for planning agent to read discovery output.
- **Fix:** Updated worker agentResult type to include metrics, updated AgentRun update to persist all metric fields, added Demand update for requirements/complexity (discovery) and plan (planning), added totalTokens/totalCostUsd accumulation on Demand
- **Files modified:** apps/api/src/queues/agent.worker.ts
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** aa0aaa6 (Task 2)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical)
**Impact on plan:** Both fixes necessary for correct agent pipeline operation. zod-to-json-schema is the standard approach for Zod v3 JSON Schema conversion. Worker metric/output persistence is essential for observability and inter-agent communication.

## Issues Encountered
None -- all issues were caught during compilation and code review and fixed inline.

## User Setup Required
None -- no new external service configuration required. ANTHROPIC_API_KEY requirement from Plan 03-01 still applies.

## Next Phase Readiness
- Both agent functions are implemented and ready for the worker to invoke
- Discovery agent produces requirements with complexity and ambiguity detection
- Planning agent reads discovery requirements and produces task decomposition
- Worker correctly stores all outputs and metrics on AgentRun and Demand
- Plan 03-03 (agent output display in UI) can read requirements/plan from Demand via API

## Self-Check: PASSED

- [x] apps/api/src/agents/discovery.agent.ts -- FOUND
- [x] apps/api/src/agents/planning.agent.ts -- FOUND
- [x] apps/api/src/queues/agent.worker.ts -- FOUND
- [x] .planning/phases/03-agent-pipeline/03-02-SUMMARY.md -- FOUND
- [x] Commit cff7868 (Task 1) -- FOUND
- [x] Commit aa0aaa6 (Task 2) -- FOUND
- [x] TypeScript compilation -- PASS (zero errors)

---
*Phase: 03-agent-pipeline*
*Completed: 2026-02-12*
