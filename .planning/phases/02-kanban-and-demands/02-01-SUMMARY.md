---
phase: 02-kanban-demands
plan: 01
subsystem: kanban-board
tags: [dnd-kit, kanban, prisma-demand-model, tanstack-query-polling, drag-and-drop, optimistic-updates, tenant-isolation]

# Dependency graph
requires:
  - phase: 01-03
    provides: forTenant() Prisma Client Extension, tenant-scoped Fastify plugin, project CRUD API, TanStack Query integration, shadcn/ui components
provides:
  - Demand Prisma model with DemandStage/DemandPriority/Complexity/MergeStatus enums, project FK, 4 indexes
  - Demand added to TENANT_MODELS for automatic tenant isolation
  - Demand CRUD API (GET /api/demands, POST /api/demands, GET /api/demands/:id, PATCH /api/demands/:id/stage) with auth + tenant middleware
  - Demand Zod schemas (demandCreateSchema, demandUpdateSchema, demandStageUpdateSchema) shared between frontend and backend
  - DemandStage, DemandPriority types and PRIORITY_LEVELS, STAGE_LABELS constants in shared package
  - Kanban UI primitives (Kanban, KanbanBoard, KanbanColumn, KanbanItem, KanbanOverlay) built on @dnd-kit/core + @dnd-kit/sortable
  - 7-column Kanban board with drag-and-drop, optimistic stage updates, and 5-second auto-polling via TanStack Query refetchInterval
  - Board page at /projects/[projectId]/board with project header, demand count, and back navigation
  - Dashboard updated with "View Board" links for each project
affects: [02-demand-detail, 03-agent-pipeline, 04-dev-testing, 05-merge-concurrency]

# Tech tracking
tech-stack:
  added: ["@dnd-kit/core@6.3.1", "@dnd-kit/sortable@10.0.0", "@dnd-kit/utilities@3.2.2", "@radix-ui/react-slot@1.2.4", "shadcn scroll-area", "shadcn separator", "shadcn tooltip"]
  patterns: [dnd-kit-kanban-primitives, tanstack-query-polling-5s, optimistic-mutation-with-rollback, demand-tenant-isolation]

key-files:
  created:
    - packages/database/prisma/migrations/20260212032300_add_demand_model/migration.sql
    - packages/shared/src/schemas/demand.ts
    - apps/api/src/routes/demands.ts
    - apps/web/src/components/ui/kanban.tsx
    - apps/web/src/components/board/kanban-board.tsx
    - apps/web/src/components/board/demand-card.tsx
    - apps/web/src/components/board/board-header.tsx
    - apps/web/src/app/(dashboard)/projects/[projectId]/board/page.tsx
    - apps/web/src/components/ui/scroll-area.tsx
    - apps/web/src/components/ui/separator.tsx
    - apps/web/src/components/ui/tooltip.tsx
  modified:
    - packages/database/prisma/schema.prisma
    - packages/database/src/tenant.ts
    - packages/shared/src/types/index.ts
    - packages/shared/src/constants/index.ts
    - packages/shared/src/index.ts
    - apps/api/src/server.ts
    - apps/web/package.json
    - apps/web/src/app/(dashboard)/page.tsx
    - pnpm-lock.yaml

key-decisions:
  - "Built Kanban UI primitives manually with @dnd-kit/core + @dnd-kit/sortable because Dice UI registry URL was unavailable -- same API pattern (Kanban, KanbanBoard, KanbanColumn, KanbanItem, KanbanOverlay) maintained"
  - "Demand stage update uses handleValueChange + onMove callbacks -- onMove fires PATCH API call, handleValueChange manages local cache for optimistic UI"
  - "Board queries use same queryKey ['demands', projectId] in both board page and kanban-board component -- shared cache ensures single source of truth"

patterns-established:
  - "Kanban UI primitives pattern: Kanban (DndContext root), KanbanBoard (flex container), KanbanColumn (droppable + SortableContext), KanbanItem (useSortable), KanbanOverlay (DragOverlay) -- built on @dnd-kit/core"
  - "Optimistic stage update pattern: useMutation onMutate cancels queries + snapshots + updates cache, onError rolls back, onSettled invalidates queries -- prevents polling race condition"
  - "Board polling pattern: TanStack Query refetchInterval: 5000 with refetchIntervalInBackground: false -- stops polling when tab is not focused"
  - "Demand API pattern: follows exact same Fastify route structure as projects.ts -- same auth + tenant middleware chain, same safeParse validation, same Prisma P2025 error handling"

# Metrics
duration: 10min
completed: 2026-02-12
---

# Phase 2 Plan 01: Demand Model, API, and Kanban Board Summary

**Demand Prisma model with tenant isolation, CRUD API, and 7-column Kanban board with @dnd-kit drag-and-drop, optimistic updates, and 5-second auto-polling via TanStack Query**

## Performance

- **Duration:** 10 min
- **Started:** 2026-02-12T03:17:57Z
- **Completed:** 2026-02-12T03:28:00Z
- **Tasks:** 2
- **Files modified:** 20

## Accomplishments

- Demand model in PostgreSQL with all fields (stage, priority, complexity, requirements, plan, branch, PR, merge status, cost tracking), 5 enums, and 4 indexes
- Demand automatically tenant-isolated via TENANT_MODELS array -- demands from other tenants are invisible
- Full demand CRUD API: list with optional projectId filter, create with auto-set createdBy, get by ID, and stage update for drag-and-drop
- Kanban UI primitives built from scratch using @dnd-kit/core + @dnd-kit/sortable (Dice UI registry unavailable) with keyboard support, collision detection, and DragOverlay
- 7-column board (Inbox, Discovery, Planning, Development, Testing, Merge, Done) with demand cards showing title, priority badge, and cost
- Drag-and-drop moves cards between columns with optimistic cache updates and automatic rollback on error
- Board auto-refreshes every 5 seconds via TanStack Query refetchInterval without manual setInterval
- Dashboard updated with per-project "View Board" quick-access links

## Task Commits

Each task was committed atomically:

1. **Task 1: Demand model, shared schemas, tenant isolation, and API routes** - `1d2b1c4` (feat)
2. **Task 2: Kanban board UI with dnd-kit, drag-and-drop, and 5-second polling** - `75d97c5` (feat)

## Files Created/Modified

- `packages/database/prisma/schema.prisma` - Added Demand model with DemandStage, DemandPriority, Complexity, MergeStatus enums, project FK, 4 indexes
- `packages/database/prisma/migrations/20260212032300_add_demand_model/migration.sql` - Database migration creating Demand table
- `packages/database/src/tenant.ts` - Added "Demand" to TENANT_MODELS for automatic tenant isolation
- `packages/shared/src/schemas/demand.ts` - Zod schemas for demand creation, update, and stage update
- `packages/shared/src/types/index.ts` - DemandStage, DemandPriority types and Demand interface
- `packages/shared/src/constants/index.ts` - PRIORITY_LEVELS array and STAGE_LABELS map for column headers
- `packages/shared/src/index.ts` - Re-exports all new demand schemas, types, and constants
- `apps/api/src/routes/demands.ts` - Demand CRUD routes (GET list, POST create, GET detail, PATCH stage)
- `apps/api/src/server.ts` - Registered demand routes in protected scope at /api/demands
- `apps/web/src/components/ui/kanban.tsx` - Kanban UI primitives (Kanban, KanbanBoard, KanbanColumn, KanbanItem, KanbanOverlay) built on @dnd-kit
- `apps/web/src/components/board/kanban-board.tsx` - Main board component with TanStack Query polling and optimistic drag-and-drop
- `apps/web/src/components/board/demand-card.tsx` - Card with title, priority badge (color-coded), and cost display
- `apps/web/src/components/board/board-header.tsx` - Board header with project name, demand count badge, and New Demand button
- `apps/web/src/app/(dashboard)/projects/[projectId]/board/page.tsx` - Board page with project fetch, loading state, and error handling
- `apps/web/src/app/(dashboard)/page.tsx` - Dashboard updated with per-project Board links
- `apps/web/src/components/ui/scroll-area.tsx` - shadcn ScrollArea for horizontal board scrolling
- `apps/web/src/components/ui/separator.tsx` - shadcn Separator component
- `apps/web/src/components/ui/tooltip.tsx` - shadcn Tooltip component

## Decisions Made

- **Built Kanban primitives manually instead of using Dice UI registry:** Dice UI registry URL (`https://diceui.com/r/kanban` and `https://www.diceui.com/r/kanban`) returned 404. Built equivalent Kanban/KanbanBoard/KanbanColumn/KanbanItem/KanbanOverlay components using @dnd-kit/core + @dnd-kit/sortable directly. Same API surface, same dnd-kit foundation.
- **Dual callback pattern for drag-and-drop:** `onValueChange` handles column state updates (for local cache), `onMove` handles API calls when items cross columns. This separates visual updates from server synchronization, preventing duplicate API calls.
- **Shared query key for board data:** Both the board page and KanbanBoardView component use `["demands", projectId]` query key. TanStack Query deduplicates the requests, so both components share the same cache and the 5-second poll is not doubled.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] request.session possibly null TypeScript error**
- **Found during:** Task 1 (demand routes compilation)
- **Issue:** `request.session.user.id` caused TS18047 "possibly null" error because the session type declaration marks it as `| null`
- **Fix:** Added non-null assertion `request.session!.user.id` since demand routes are inside the protected scope where auth plugin guarantees session exists
- **Files modified:** apps/api/src/routes/demands.ts
- **Verification:** `pnpm build` succeeds
- **Committed in:** 1d2b1c4 (Task 1 commit)

**2. [Rule 3 - Blocking] Dice UI Kanban registry URL unavailable**
- **Found during:** Task 2 (installing Dice UI Kanban)
- **Issue:** `npx shadcn@latest add "https://diceui.com/r/kanban"` returned "The item at ... was not found" error for both diceui.com and www.diceui.com
- **Fix:** Installed @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities, @radix-ui/react-slot manually and built Kanban UI primitives from scratch following the same API pattern documented in research
- **Files modified:** apps/web/package.json, apps/web/src/components/ui/kanban.tsx
- **Verification:** `pnpm build` succeeds, Kanban component exports match expected API
- **Committed in:** 75d97c5 (Task 2 commit)

**3. [Rule 3 - Blocking] Prisma advisory lock stalled from previous migration attempt**
- **Found during:** Task 1 (running Prisma migration)
- **Issue:** Background migration process acquired advisory lock (72707369) but stalled, blocking subsequent migration attempts with P1002 timeout
- **Fix:** Terminated stalled PostgreSQL connections (`pg_terminate_backend`) via Docker exec, then retried migration successfully
- **Files modified:** None (infrastructure fix)
- **Verification:** Migration 20260212032300_add_demand_model applied successfully
- **Committed in:** 1d2b1c4 (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking)
**Impact on plan:** All fixes necessary for correctness and functionality. Kanban primitives built manually maintain the same API surface as Dice UI. No scope creep.

## Issues Encountered

- Prisma advisory lock (`pg_advisory_lock(72707369)`) held by stalled background process from a previous migration attempt -- resolved by terminating the stalled PostgreSQL connection via `pg_terminate_backend()` before retrying the migration
- Dice UI registry unavailable -- the `npx shadcn@latest add "https://diceui.com/r/kanban"` command returned 404 for both diceui.com and www.diceui.com, requiring manual @dnd-kit installation and Kanban component creation

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for Plan 02 (Demand Detail and Creation):**
- Demand model and API complete -- detail page and creation form can be built on existing endpoints
- Board infrastructure established -- demand cards can link to detail pages
- "New Demand" button in board header ready to link to creation flow
- Zod schemas (demandCreateSchema, demandUpdateSchema) ready for form validation

**Ready for Phase 3 (Agent Pipeline):**
- Demand model has fields for all future agent phases: complexity (Discovery), requirements/plan JSON (Planning), branchName/prUrl (Development), mergeStatus/mergeConflicts (Merge)
- Stage enum supports full pipeline flow from inbox to done
- Tenant isolation prevents cross-tenant data access for agent operations

---
*Phase: 02-kanban-demands*
*Completed: 2026-02-12*

## Self-Check: PASSED

- All 11 claimed created files verified to exist on disk
- Commit 1d2b1c4 (Task 1) verified in git log
- Commit 75d97c5 (Task 2) verified in git log
- `pnpm build` succeeds across all workspaces (API + Web)
- Demand table exists in PostgreSQL with all columns, enums, and indexes
- "Demand" present in TENANT_MODELS array
