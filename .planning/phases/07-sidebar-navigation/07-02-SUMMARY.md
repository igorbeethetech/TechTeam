---
phase: 07-sidebar-navigation
plan: 02
subsystem: ui
tags: [boards-page, kanban, dnd-kit, drag-handle, touch-sensor, tanstack-query, prisma-groupby]

# Dependency graph
requires:
  - phase: 07-sidebar-navigation
    plan: 01
    provides: "Sidebar layout with Boards nav link, dashboard structure"
  - phase: 02-kanban-demands
    provides: "Kanban board UI, DemandCard, drag-and-drop pipeline"
  - phase: 01-foundation
    provides: "Project and Demand models, API routes, auth"
provides:
  - "GET /api/projects/boards endpoint with demand counts per stage via Prisma groupBy"
  - "Boards page at /boards with project cards in responsive grid"
  - "BoardCard and BoardsGrid components"
  - "KanbanItemContext and useKanbanItemHandle hook for drag handle delegation"
  - "DemandCard with GripVertical drag handle and click-to-navigate"
  - "TouchSensor with 300ms delay for mobile long-press drag"
affects: [08-websocket-realtime, 11-pipeline-e2e]

# Tech tracking
tech-stack:
  added: []
  patterns: ["KanbanItemContext for drag handle delegation via useKanbanItemHandle hook", "Prisma groupBy for aggregate counts in API responses", "router.push for in-card navigation avoiding nested interactive elements"]

key-files:
  created:
    - "apps/web/src/app/(dashboard)/boards/page.tsx"
    - "apps/web/src/components/boards/boards-grid.tsx"
    - "apps/web/src/components/boards/board-card.tsx"
  modified:
    - "apps/api/src/routes/projects.ts"
    - "apps/web/src/components/ui/kanban.tsx"
    - "apps/web/src/components/board/kanban-board.tsx"
    - "apps/web/src/components/board/demand-card.tsx"

key-decisions:
  - "Used router.push on card div instead of Link wrapper to avoid nested interactive elements (button inside Link)"
  - "KanbanItemContext provides drag handle props to children, keeping backward compat with asHandle prop"
  - "TouchSensor with 300ms delay added alongside PointerSensor for mobile drag support"
  - "Removed onPointerDown stopPropagation from drag handle to avoid overriding dnd-kit listeners"

patterns-established:
  - "Drag handle pattern: useKanbanItemHandle() hook returns setActivatorNodeRef + listeners for child-rendered drag handles"
  - "Card navigation pattern: onClick + router.push with isDragging guard instead of Link wrapper"
  - "Board API pattern: Prisma groupBy for efficient per-project demand counts in a single query"

# Metrics
duration: 3min
completed: 2026-02-14
---

# Phase 7 Plan 2: Boards Page and Card Interactions Summary

**Boards overview page with project demand counts via Prisma groupBy, and refactored Kanban cards with GripVertical drag handle + click-to-navigate + mobile touch support**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-14T16:34:30Z
- **Completed:** 2026-02-14T16:37:32Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Added GET /api/projects/boards endpoint using Prisma groupBy for efficient demand counts per pipeline stage
- Created Boards page at /boards with responsive grid of project cards showing name and stage-count badges
- Refactored DemandCard with GripVertical drag handle (separate from card body), click-to-navigate via router.push, hover highlight
- Added KanbanItemContext and useKanbanItemHandle hook for drag handle delegation pattern
- Added TouchSensor with 300ms delay to Kanban root for mobile long-press drag
- Removed ExternalLink icon from demand cards per user decision

## Task Commits

Each task was committed atomically:

1. **Task 1: Boards API endpoint and Boards page UI** - `646738d` (feat)
2. **Task 2: Refactor Kanban cards for drag handle + click navigation + mobile touch** - `6356c26` (feat)

## Files Created/Modified
- `apps/api/src/routes/projects.ts` - Added GET /boards endpoint with Prisma groupBy demand counts
- `apps/web/src/app/(dashboard)/boards/page.tsx` - Boards page route with heading and BoardsGrid
- `apps/web/src/components/boards/boards-grid.tsx` - Grid container fetching boards data with loading/empty states
- `apps/web/src/components/boards/board-card.tsx` - Project card with name and demand stage badges, links to Kanban board
- `apps/web/src/components/ui/kanban.tsx` - Added KanbanItemContext, useKanbanItemHandle hook, TouchSensor
- `apps/web/src/components/board/kanban-board.tsx` - Removed asHandle from KanbanItem usage
- `apps/web/src/components/board/demand-card.tsx` - Rewritten with GripVertical drag handle and click navigation

## Decisions Made
- Used router.push on card div instead of wrapping in Link -- avoids nested interactive elements issue (button drag handle inside Link)
- KanbanItemContext exposes listeners/attributes/setActivatorNodeRef to child components, keeping backward compat with existing asHandle prop
- TouchSensor added with 300ms delay alongside PointerSensor for mobile long-press drag support
- Removed onPointerDown stopPropagation from drag handle button to avoid overriding dnd-kit's pointer listeners (onClick stopPropagation is sufficient)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed conflicting onPointerDown handler on drag handle**
- **Found during:** Task 2 (DemandCard rewrite)
- **Issue:** Plan included `onPointerDown={(e) => e.stopPropagation()}` on the drag handle button, which would override dnd-kit's `onPointerDown` listener from `{...listeners}` (React uses last prop definition), breaking drag functionality
- **Fix:** Removed the explicit onPointerDown handler; onClick stopPropagation is sufficient to prevent card navigation when clicking the grip
- **Files modified:** apps/web/src/components/board/demand-card.tsx
- **Verification:** TypeScript compiles, drag handle listeners not overridden
- **Committed in:** 6356c26 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix for drag functionality. Without it, drag handle would not initiate drag. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 7 (Sidebar Navigation and Boards) is now complete
- Sidebar layout + Boards page + card interactions all delivered
- Ready for Phase 8 (WebSocket real-time) -- Kanban board already has TanStack Query cache keys ready for WebSocket invalidation
- The boards page uses query key ["projects", "boards"] which can be invalidated via WebSocket events

## Self-Check: PASSED

All 7 files verified present. Both task commits (646738d, 6356c26) verified in git log.

---
*Phase: 07-sidebar-navigation*
*Completed: 2026-02-14*
