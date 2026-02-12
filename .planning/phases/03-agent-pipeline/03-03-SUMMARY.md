---
phase: 03-agent-pipeline
plan: 03
subsystem: ui
tags: [react, tanstack-query, shadcn, tailwind, demand-detail, agent-runs, structured-output]

# Dependency graph
requires:
  - phase: 03-agent-pipeline
    plan: 01
    provides: AgentRun type, agent-runs API endpoint, DiscoveryOutput/PlanningOutput types, agentStatus on Demand
  - phase: 02-kanban-demands
    provides: Demand detail page, demand-detail.tsx component, pipeline-progress component
provides:
  - RequirementsView component rendering Discovery output as structured sections (functional/non-functional requirements, complexity, ambiguities, summary)
  - PlanView component rendering Planning output as structured sections (tasks with files/dependencies, execution order, risk areas, summary)
  - AgentRunList component fetching /api/agent-runs with 5s polling, displaying phase/status badges, tokens, cost, duration, collapsible errors
  - Agent status badge in demand detail showing running/queued/paused/failed state
  - Auto-refresh polling on demand detail page when agents are active
affects: [04-dev-testing, 06-metrics-notifications]

# Tech tracking
tech-stack:
  added: []
  patterns: [refetchInterval callback for self-referencing polling, collapsible error section with Set state, type assertion for JSON columns to typed interfaces]

key-files:
  created:
    - apps/web/src/components/demands/requirements-view.tsx
    - apps/web/src/components/demands/plan-view.tsx
    - apps/web/src/components/demands/agent-run-list.tsx
  modified:
    - apps/web/src/components/demands/demand-detail.tsx
    - apps/web/src/app/(dashboard)/demands/[demandId]/page.tsx

key-decisions:
  - "refetchInterval uses callback form (query) => to avoid circular variable reference when polling depends on fetched data"
  - "Type assertions (as DiscoveryOutput, as PlanningOutput) for JSON columns since Prisma stores them as unknown"

patterns-established:
  - "Structured output rendering: typed components accepting agent output types instead of raw JSON pre blocks"
  - "Active polling pattern: refetchInterval callback checking query.state.data for agent status"
  - "Collapsible UI sections: useState<Set<string>> pattern for toggle state across list items"

# Metrics
duration: 3min
completed: 2026-02-12
---

# Phase 3 Plan 03: Demand Detail Agent Output Display Summary

**RequirementsView, PlanView, and AgentRunList components replacing raw JSON with structured, human-readable agent output display and run history with auto-refresh polling**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-12T04:31:27Z
- **Completed:** 2026-02-12T04:34:30Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Discovery output renders as structured sections (functional requirements with acceptance criteria, non-functional requirements grouped by colored category badges, complexity badge with explanation, amber-bordered ambiguities warning, summary) instead of raw JSON
- Planning output renders as structured sections (tasks in execution order with type/complexity badges, file lists with action badges, dependency badges, execution order flow, amber-bordered risk areas, summary) instead of raw JSON
- Agent run list fetches from /api/agent-runs with 5s polling while agents active, shows phase badge, status badge (with pulse animation for running), tokens in/out, cost in USD, duration, attempt number, and collapsible error messages
- Agent status badge displayed next to current stage in demand detail (running=blue+pulse, queued=gray, paused=yellow with "needs human input", failed=red)
- Demand detail page auto-refreshes when agentStatus is queued or running via refetchInterval callback

## Task Commits

Each task was committed atomically:

1. **Task 1: RequirementsView and PlanView structured display components** - `a3d2671` (feat)
2. **Task 2: AgentRunList component and demand detail page integration** - `b6e3ae0` (feat)

## Files Created/Modified
- `apps/web/src/components/demands/requirements-view.tsx` - Renders DiscoveryOutput as structured sections: functional reqs, non-functional reqs with category badges, complexity badge, ambiguities warning, summary
- `apps/web/src/components/demands/plan-view.tsx` - Renders PlanningOutput as structured sections: tasks with type/complexity badges, files with action badges, dependencies, execution order flow, risk areas
- `apps/web/src/components/demands/agent-run-list.tsx` - Fetches and displays agent run history with polling, metrics (tokens, cost, duration), collapsible errors
- `apps/web/src/components/demands/demand-detail.tsx` - Integrated RequirementsView, PlanView, AgentRunList; added agent status badge; replaced raw JSON pre blocks
- `apps/web/src/app/(dashboard)/demands/[demandId]/page.tsx` - Added refetchInterval callback for auto-refresh, passes isAgentActive prop to DemandDetail

## Decisions Made
- Used refetchInterval callback form `(query) =>` instead of referencing `data` directly, because destructured `data` from useQuery creates a circular reference when used in the same options object. TanStack Query v5 supports callback-style refetchInterval that receives the query instance.
- Type assertions (`as DiscoveryOutput`, `as PlanningOutput`) used for demand.requirements and demand.plan since Prisma stores JSON columns as `unknown` in the TypeScript type. The runtime data will match the schema when populated by agents.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] refetchInterval circular reference in useQuery**
- **Found during:** Task 2 (demand detail page update)
- **Issue:** Plan specified `refetchInterval: data?.demand?.agentStatus === 'queued' ? 5000 : false` but `data` is destructured from the same `useQuery` call, creating a TypeScript circular reference error (TS7022, TS2448)
- **Fix:** Changed to callback form: `refetchInterval: (query) => { const status = query.state.data?.demand?.agentStatus; return status === 'queued' || status === 'running' ? 5000 : false }`
- **Files modified:** apps/web/src/app/(dashboard)/demands/[demandId]/page.tsx
- **Verification:** `npx tsc --noEmit` passes cleanly
- **Committed in:** b6e3ae0 (Task 2)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix for TypeScript compilation. No scope creep.

## Issues Encountered
None -- the circular reference was caught immediately during TypeScript compilation and fixed inline.

## User Setup Required
None -- no external service configuration required. All components use existing API endpoints from Plan 03-01.

## Next Phase Readiness
- All three demand detail display components complete: RequirementsView, PlanView, AgentRunList
- Demand detail page fully prepared to show agent outputs once Discovery and Planning agents populate data
- Auto-refresh polling ready for real-time agent execution monitoring
- Phase 3 infrastructure complete -- Plan 03-02 (Discovery agent implementation) can proceed

## Self-Check: PASSED

- All 6 files FOUND (3 created, 2 modified, 1 summary)
- Both task commits FOUND (a3d2671, b6e3ae0)
- Artifact line counts: requirements-view.tsx=132 (min 30), plan-view.tsx=180 (min 30), agent-run-list.tsx=162 (min 40)
- TypeScript compilation: clean (0 errors)

---
*Phase: 03-agent-pipeline*
*Completed: 2026-02-12*
